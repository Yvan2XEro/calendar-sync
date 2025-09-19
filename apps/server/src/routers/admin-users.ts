import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db } from "@/db";
import { member, organization, user } from "@/db/schema/auth";
import { adminProcedure, router } from "@/lib/trpc";

const listInputSchema = z.object({
        q: z.string().trim().optional(),
        roles: z.array(z.string().min(1)).optional(),
        status: z.enum(["active", "banned", "all"]).optional(),
        calendarId: z.string().min(1).optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        sort: z
                .object({
                        field: z.enum(["createdAt", "name", "email"]),
                        dir: z.enum(["asc", "desc"]),
                })
                .optional(),
});

const defaultRoles = ["admin", "user"] as const;

export const adminUsersRouter = router({
        list: adminProcedure.input(listInputSchema).query(async ({ input }) => {
                const page = input.page ?? 1;
                const pageSize = input.pageSize ?? 25;
                const sortField = input.sort?.field ?? "createdAt";
                const sortDir = input.sort?.dir ?? "desc";

                const calendarUserIds = input.calendarId
                        ? await db
                                        .select({ userId: member.userId })
                                        .from(member)
                                        .where(eq(member.organizationId, input.calendarId))
                        : null;

                if (calendarUserIds && calendarUserIds.length === 0) {
                        return {
                                items: [],
                                total: 0,
                                page,
                                pageSize,
                        };
                }

                const conditions: Array<ReturnType<typeof eq>> = [];

                if (input.q) {
                        const term = `%${input.q}%`;
                        conditions.push(or(ilike(user.name, term), ilike(user.email, term)));
                }

                if (input.roles?.length) {
                        conditions.push(inArray(user.role, input.roles));
                }

                if (input.status === "active") {
                        conditions.push(or(eq(user.banned, false), isNull(user.banned)));
                } else if (input.status === "banned") {
                        conditions.push(eq(user.banned, true));
                }

                if (calendarUserIds) {
                        const ids = calendarUserIds.map((row) => row.userId);
                        conditions.push(inArray(user.id, ids));
                }

                const whereClause = conditions.length ? and(...conditions) : undefined;

                let orderByExpression;
                if (sortField === "name") {
                        orderByExpression = sortDir === "asc" ? asc(user.name) : desc(user.name);
                } else if (sortField === "email") {
                        orderByExpression = sortDir === "asc" ? asc(user.email) : desc(user.email);
                } else {
                        orderByExpression = sortDir === "asc" ? asc(user.createdAt) : desc(user.createdAt);
                }

                const totalQuery = db.select({ value: count(user.id) }).from(user);
                const usersQuery = db
                        .select({
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                image: user.image,
                                role: user.role,
                                banned: user.banned,
                                createdAt: user.createdAt,
                        })
                        .from(user)
                        .orderBy(orderByExpression)
                        .limit(pageSize)
                        .offset((page - 1) * pageSize);

                const filteredTotalQuery = whereClause ? totalQuery.where(whereClause) : totalQuery;
                const filteredUsersQuery = whereClause ? usersQuery.where(whereClause) : usersQuery;

                const [totalResult, rows] = await Promise.all([
                        filteredTotalQuery,
                        filteredUsersQuery,
                ]);

                const total = Number(totalResult[0]?.value ?? 0);

                if (rows.length === 0) {
                        return {
                                items: [],
                                total,
                                page,
                                pageSize,
                        };
                }

                const userIds = rows.map((row) => row.id);
                const calendarRows = await db
                        .select({
                                userId: member.userId,
                                calendarId: organization.id,
                                name: organization.name,
                                slug: organization.slug,
                        })
                        .from(member)
                        .innerJoin(organization, eq(member.organizationId, organization.id))
                        .where(inArray(member.userId, userIds));

                const calendarMap = new Map<
                        string,
                        { calendars: Array<{ id: string; name: string; slug: string }>; overflow: number }
                >();

                for (const calendar of calendarRows) {
                        const entry = calendarMap.get(calendar.userId) ?? {
                                calendars: [],
                                overflow: 0,
                        };

                        if (entry.calendars.length < 5) {
                                entry.calendars.push({
                                        id: calendar.calendarId,
                                        name: calendar.name,
                                        slug: calendar.slug,
                                });
                        } else {
                                entry.overflow += 1;
                        }

                        calendarMap.set(calendar.userId, entry);
                }

                return {
                        items: rows.map((row) => {
                                const calendarInfo = calendarMap.get(row.id) ?? {
                                        calendars: [],
                                        overflow: 0,
                                };

                                return {
                                        userId: row.id,
                                        name: row.name,
                                        email: row.email,
                                        avatarUrl: row.image ?? undefined,
                                        roles: row.role ? [row.role] : [],
                                        isBanned: !!row.banned,
                                        calendars: calendarInfo.calendars,
                                        calendarsOverflow: calendarInfo.overflow,
                                        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
                                };
                        }),
                        total,
                        page,
                        pageSize,
                };
        }),
        rolesOptions: adminProcedure.query(async () => {
                const rows = await db.select({ role: user.role }).from(user).groupBy(user.role);
                const roles = new Set<string>();
                for (const role of defaultRoles) {
                        roles.add(role);
                }
                for (const row of rows) {
                        if (row.role) {
                                roles.add(row.role);
                        }
                }
                return Array.from(roles).sort();
        }),
        calendarsOptions: adminProcedure.query(async () => {
                const calendars = await db
                        .select({ id: organization.id, name: organization.name, slug: organization.slug })
                        .from(organization)
                        .orderBy(asc(organization.name));
                return calendars.map((calendar) => ({
                        id: calendar.id,
                        name: calendar.name,
                        slug: calendar.slug,
                }));
        }),
        ban: adminProcedure
                .input(z.object({ userId: z.string().min(1) }))
                .mutation(async ({ input }) => {
                        const result = await db
                                .update(user)
                                .set({ banned: true, updatedAt: new Date() })
                                .where(eq(user.id, input.userId))
                                .returning({ id: user.id });

                        if (result.length === 0) {
                                throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                        }

                        return { ok: true };
                }),
        reactivate: adminProcedure
                .input(z.object({ userId: z.string().min(1) }))
                .mutation(async ({ input }) => {
                        const result = await db
                                .update(user)
                                .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
                                .where(eq(user.id, input.userId))
                                .returning({ id: user.id });

                        if (result.length === 0) {
                                throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                        }

                        return { ok: true };
                }),
});
