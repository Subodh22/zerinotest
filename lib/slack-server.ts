import { SlackClient } from "@/src/slack";

/** Build a Slack client from env vars. Returns null if not configured. */
export function getSlackClient(): SlackClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  return new SlackClient(token);
}
