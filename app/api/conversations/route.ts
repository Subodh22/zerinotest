import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import { getGmailClient } from "@/lib/gmail-server";
import { getSlackClient } from "@/lib/slack-server";
import { getHeader } from "@/src/gmail";
import type { GmailMessage } from "@/src/gmail";
import type { Conversation } from "@/lib/types";

export const dynamic = "force-dynamic";

type Platform = "facebook" | "instagram" | "twitter" | "bluesky" | "reddit" | "telegram";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");

    const results: Conversation[] = [];
    let meta: unknown = null;

    // Zernio conversations (skip if filtering to google only)
    if (platform !== "google") {
      const z = getClient();
      const res = (await z.listConversations({
        limit: 50,
        ...(platform ? { platform: platform as Platform } : {}),
      })) as { data?: unknown[]; meta?: unknown };
      const zConvs = (res?.data ?? coerceArray(res)) as Conversation[];
      results.push(...zConvs);
      meta = res?.meta ?? null;
    }

    // Gmail threads (skip if filtering to a non-google platform)
    if (!platform || platform === "google") {
      const gmail = getGmailClient();
      if (gmail) {
        try {
          const profile = await gmail.getProfile();
          const accountId = `gmail:${profile.emailAddress}`;
          const threadsRes = await gmail.listThreads({ maxResults: 30, q: "in:inbox" });
          if (threadsRes.threads) {
            const threadDetails = await Promise.all(
              threadsRes.threads.map((t) => gmail.getThread(t.id, "metadata")),
            );
            for (const thread of threadDetails) {
              const firstMsg = thread.messages[0];
              const lastMsg = thread.messages[thread.messages.length - 1];
              const from = getHeader(firstMsg, "From") ?? "";
              const subject = getHeader(firstMsg, "Subject") ?? "(no subject)";
              const nameMatch = from.match(/^(.+?)\s*<(.+)>$/);
              const participantName = nameMatch ? nameMatch[1].replace(/^"|"$/g, "") : from;

              results.push({
                id: `gmail:${thread.id}`,
                platform: "google",
                accountId,
                participantName,
                lastMessage: subject,
                updatedTime: new Date(Number(lastMsg.internalDate)).toISOString(),
                status: "active",
                unreadCount: thread.messages.some((m: GmailMessage) => m.labelIds?.includes("UNREAD")) ? 1 : null,
              });
            }
          }
        } catch {
          // Gmail not ready — skip
        }
      }
    }

    // Slack DMs (skip if filtering to a non-slack platform)
    if (!platform || platform === "slack") {
      const slack = getSlackClient();
      if (slack) {
        try {
          const auth = await slack.authTest();
          const accountId = `slack:${auth.team_id}`;
          const convos = await slack.listConversations({ types: "im,mpim", limit: 30 });

          // Collect unique user IDs to resolve names
          const userIds = convos.channels
            .filter((ch) => ch.is_im && ch.user)
            .map((ch) => ch.user!);
          const users = await slack.usersInfo(userIds);

          for (const ch of convos.channels) {
            const user = ch.user ? users.get(ch.user) : null;
            const participantName = user?.real_name ?? user?.profile.display_name ?? user?.name ?? ch.name ?? "Unknown";
            const lastTs = ch.latest?.ts ? Number(ch.latest.ts) * 1000 : (ch.updated ?? 0) * 1000;

            results.push({
              id: `slack:${ch.id}`,
              platform: "slack",
              accountId,
              participantName,
              lastMessage: ch.latest?.text ?? "",
              updatedTime: lastTs ? new Date(lastTs).toISOString() : undefined,
              status: "active",
              unreadCount: null,
            });
          }
        } catch {
          // Slack not ready — skip
        }
      }
    }

    // Sort by most recent first
    results.sort((a, b) => {
      const ta = a.updatedTime ? new Date(a.updatedTime).getTime() : 0;
      const tb = b.updatedTime ? new Date(b.updatedTime).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({ data: results, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
