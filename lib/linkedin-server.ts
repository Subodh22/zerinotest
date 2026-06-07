import { LinkedInClient } from "@/src/linkedin";

/** Build a LinkedIn client from env vars. Returns null if not configured. */
export function getLinkedInClient(): LinkedInClient | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const refreshToken = process.env.LINKEDIN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return new LinkedInClient(clientId, clientSecret, refreshToken);
}
