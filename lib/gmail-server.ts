import { GmailClient } from "@/src/gmail";

/** Build a Gmail client from env vars. Returns null if not configured yet. */
export function getGmailClient(): GmailClient | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return new GmailClient(clientId, clientSecret, refreshToken);
}
