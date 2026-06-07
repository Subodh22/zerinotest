import { OutlookClient } from "@/src/outlook";

/** Build an Outlook client from env vars. Returns null if not configured. */
export function getOutlookClient(): OutlookClient | null {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const refreshToken = process.env.MS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return new OutlookClient(clientId, clientSecret, refreshToken);
}
