import { NextResponse } from "next/server";
import { getSlackClient } from "@/lib/slack-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const slack = getSlackClient();
  if (!slack) {
    return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
  }

  const results: Record<string, unknown> = {};

  try {
    results.auth = await slack.authTest();
  } catch (e) {
    results.authError = (e as Error).message;
  }

  try {
    results.conversations = await slack.listConversations({
      types: "public_channel,private_channel,im,mpim",
      limit: 10,
    });
  } catch (e) {
    results.conversationsError = (e as Error).message;
  }

  return NextResponse.json(results);
}
