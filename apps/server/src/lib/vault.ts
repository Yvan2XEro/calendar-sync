import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { providerSecret } from "@/db/schema/app";
import { v4 as uuidv4 } from "uuid";

export type VaultPayload = Record<string, unknown>;

export async function writeVaultSecret(
  organizationId: string,
  payload: VaultPayload,
  existingRef?: string | null,
) {
  const now = new Date();

  if (existingRef) {
    const updated = await db
      .update(providerSecret)
      .set({ data: payload, updatedAt: now })
      .where(
        and(
          eq(providerSecret.id, existingRef),
          eq(providerSecret.organizationId, organizationId),
        ),
      )
      .returning({ id: providerSecret.id });

    if (updated.length > 0) {
      return updated[0]?.id ?? existingRef;
    }
  }

  const id = uuidv4();

  await db.insert(providerSecret).values({
    id,
    organizationId,
    data: payload,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function readVaultSecret<TPayload extends VaultPayload>(
  organizationId: string,
  reference?: string | null,
): Promise<TPayload | null> {
  if (!reference) {
    return null;
  }

  const secret = await db.query.providerSecret.findFirst({
    where: and(
      eq(providerSecret.id, reference),
      eq(providerSecret.organizationId, organizationId),
    ),
  });

  if (!secret) {
    return null;
  }

  return secret.data as TPayload;
}
