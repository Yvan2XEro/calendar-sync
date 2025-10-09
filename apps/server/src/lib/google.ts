import { OAuth2Client } from "google-auth-library";

export function createGoogleOAuthClient(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}
