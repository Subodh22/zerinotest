import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import {
  requireUserId,
  getGmailClientForUser,
  getSlackClientForUser,
  getOutlookClientForUser,
  AuthRequiredError,
} from "@/lib/user-accounts";
import { getHeader } from "@/src/gmail";
import type { GmailMessage } from "@/src/gmail";
import type { Conversation } from "@/lib/types";

export const dynamic = "force-dynamic";

type Platform = "facebook" | "instagram" | "twitter" | "bluesky" | "reddit" | "telegram";

// Unified conversation list, merged and sorted across every connected source.
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
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

    // Gmail threads
    if (!platform || platform === "google") {
      const gmail = await getGmailClientForUser(userId);
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
                unreadCount: thread.messages.some((m: GmailMessage) =>
                  m.labelIds?.includes("UNREAD"),
                )
                  ? 1
                  : null,
              });
            }
          }
        } catch {
          // Gmail not ready — skip
        }
      }
    }

    // Slack DMs
    if (!platform || platform === "slack") {
      const slack = await getSlackClientForUser(userId);
      if (slack) {
        try {
          const auth = await slack.authTest();
          const accountId = `slack:${auth.team_id}`;
          const convos = await slack.listConversations({
            types: "public_channel,private_channel,im,mpim",
            limit: 30,
          });

          const userIds = convos.channels
            .filter((ch) => ch.is_im && ch.user)
            .map((ch) => ch.user!);
          const users = await slack.usersInfo(userIds);

          for (const ch of convos.channels) {
            const user = ch.user ? users.get(ch.user) : null;
            const participantName = ch.is_im
              ? (user?.real_name ?? user?.profile.display_name ?? user?.name ?? "Unknown")
              : ch.name
                ? `#${ch.name}`
                : "Unknown channel";
            const lastTs = ch.latest?.ts
              ? Number(ch.latest.ts) * 1000
              : (ch.updated ?? 0) * 1000;

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
        } catch (slackErr) {
          console.error("Slack conversations error:", slackErr);
        }
      }
    }

    // Outlook threads
    if (!platform || platform === "outlook") {
      const outlook = await getOutlookClientForUser(userId);
      if (outlook) {
        try {
          const profile = await outlook.getProfile();
          const accountId = `outlook:${profile.emailAddress}`;
          const convos = await outlook.listConversations(30);
          for (const c of convos) {
            results.push({
              id: `outlook:${c.conversationId}`,
              platform: "outlook",
              accountId,
              participantName: c.participantName,
              lastMessage: c.subject,
              updatedTime: c.updatedTime,
              status: "active",
              unreadCount: c.unread || null,
              url: c.webLink,
            });
          }
        } catch (outlookErr) {
          console.error("Outlook conversations error:", outlookErr);
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
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return errorResponse(e);
  }
}
