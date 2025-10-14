import { and, eq } from "drizzle-orm";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

import { db } from "../db";
import { account } from "../db/schema/auth";
import { createGoogleOAuthClient } from "./google";

type GoogleTokens = {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
};

type GoogleAccountRow = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  providerId: string;
};

async function getUserGoogleAccount(
  userId: string,
): Promise<GoogleAccountRow | null> {
  const [row] = await db
    .select({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      providerId: account.providerId,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")))
    .limit(1);

  return row ?? null;
}

async function saveTokens(userId: string, tokens: GoogleTokens) {
  await db
    .update(account)
    .set({
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      accessTokenExpiresAt:
        tokens.expiry_date != null ? new Date(tokens.expiry_date) : undefined,
    })
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")));
}

export async function getCalendarClientForUser(userId: string): Promise<{
  auth: OAuth2Client;
  calendar: ReturnType<typeof google.calendar>;
}> {
  const acct = await getUserGoogleAccount(userId);
  if (!acct) throw new Error("No linked Google account");

  const auth = createGoogleOAuthClient();
  const expiryMs = acct.accessTokenExpiresAt?.getTime();

  auth.setCredentials({
    access_token: acct.accessToken ?? undefined,
    refresh_token: acct.refreshToken ?? undefined,
    expiry_date: expiryMs,
  });

  auth.on("tokens", async (tokens) => {
    const toSave: GoogleTokens = {
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
    };
    await saveTokens(userId, toSave);
  });

  await auth.getAccessToken();

  const calendar = google.calendar({
    version: "v3",
    auth: auth as unknown as any,
  });
  return { auth, calendar };
}
