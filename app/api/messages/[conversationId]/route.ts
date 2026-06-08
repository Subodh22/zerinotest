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
import { getHeader, getTextBody } from "@/src/gmail";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ conversationId: string }> };

// GET /api/messages/{conversationId}?accountId=...  — read a thread
export async function GET(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { conversationId } = await params;
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    // Gmail thread
    if (conversationId.startsWith("gmail:")) {
      const gmail = await getGmailClientForUser(userId);
      if (!gmail) {
        return NextResponse.json({ error: "Gmail not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("gmail:", "");
      const userEmail = accountId.replace("gmail:", "");
      const thread = await gmail.getThread(threadId, "full");
      const messages: Message[] = thread.messages.map((m) => {
        const from = getHeader(m, "From") ?? "";
        const fromEmail = from.match(/<(.+)>/)?.[1] ?? from;
        const isOutgoing = fromEmail.toLowerCase() === userEmail.toLowerCase();
        const nameMatch = from.match(/^(.+?)\s*</);
        const senderName = nameMatch ? nameMatch[1].replace(/^"|"$/g, "") : from;

        return {
          id: m.id,
          message: getTextBody(m),
          senderId: fromEmail,
          senderName: isOutgoing ? null : senderName,
          direction: isOutgoing ? "outgoing" : "incoming",
          createdAt: new Date(Number(m.internalDate)).toISOString(),
          attachments: [],
          deliveryStatus: null,
        };
      });
      return NextResponse.json({ data: messages });
    }

    // Slack thread
    if (conversationId.startsWith("slack:")) {
      const slack = await getSlackClientForUser(userId);
      if (!slack) {
        return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
      }
      const channelId = conversationId.replace("slack:", "");
      const auth = await slack.authTest();
      const history = await slack.conversationHistory(channelId, { limit: 100 });

      const userIds = [...new Set(history.messages.filter((m) => m.user).map((m) => m.user!))];
      const users = await slack.usersInfo(userIds);

      const messages: Message[] = history.messages
        .filter((m) => !m.subtype)
        .reverse()
        .map((m) => {
          const isOutgoing = m.user === auth.user_id;
          const user = m.user ? users.get(m.user) : null;
          const senderName = user?.real_name ?? user?.profile.display_name ?? user?.name ?? null;
          return {
            id: m.ts,
            message: m.text,
            senderId: m.user ?? m.bot_id ?? "",
            senderName: isOutgoing ? null : senderName,
            direction: isOutgoing ? "outgoing" as const : "incoming" as const,
            createdAt: new Date(Number(m.ts) * 1000).toISOString(),
            attachments: [],
            deliveryStatus: null,
          };
        });
      return NextResponse.json({ data: messages });
    }

    // Outlook thread
    if (conversationId.startsWith("outlook:")) {
      const outlook = await getOutlookClientForUser(userId);
      if (!outlook) {
        return NextResponse.json({ error: "Outlook not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("outlook:", "");
      const thread = await outlook.listThreadMessages(threadId);
      const messages: Message[] = thread.map((m) => ({
        id: m.id,
        message: m.body,
        senderId: undefined,
        senderName: m.fromMe ? null : m.fromName,
        direction: m.fromMe ? "outgoing" : "incoming",
        createdAt: m.receivedDateTime,
        attachments: [],
        deliveryStatus: null,
      }));
      return NextResponse.json({ data: messages });
    }

    // Zernio thread
    const res = await z_listMessages(conversationId, accountId);
    return NextResponse.json({ data: res });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return errorResponse(e);
  }
}

// POST /api/messages/{conversationId}  body: { accountId, message }  — send a reply
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { conversationId } = await params;
    const body = (await req.json()) as { accountId?: string; message?: string };
    if (!body.accountId || !body.message?.trim()) {
      return NextResponse.json({ error: "accountId and message are required" }, { status: 400 });
    }

    // Gmail reply
    if (conversationId.startsWith("gmail:")) {
      const gmail = await getGmailClientForUser(userId);
      if (!gmail) {
        return NextResponse.json({ error: "Gmail not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("gmail:", "");
      const thread = await gmail.getThread(threadId, "metadata");
      const lastMsg = thread.messages[thread.messages.length - 1];
      const to = getHeader(lastMsg, "From") ?? "";
      const subject = getHeader(lastMsg, "Subject") ?? "";
      const messageId = getHeader(lastMsg, "Message-Id");
      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
      const result = await gmail.sendReply(threadId, to, replySubject, body.message.trim(), messageId);
      return NextResponse.json({ ok: true, result });
    }

    // Slack reply
    if (conversationId.startsWith("slack:")) {
      const slack = await getSlackClientForUser(userId);
      if (!slack) {
        return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
      }
      const channelId = conversationId.replace("slack:", "");
      const result = await slack.postMessage(channelId, body.message.trim());
      return NextResponse.json({ ok: true, result });
    }

    // Outlook reply
    if (conversationId.startsWith("outlook:")) {
      const outlook = await getOutlookClientForUser(userId);
      if (!outlook) {
        return NextResponse.json({ error: "Outlook not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("outlook:", "");
      const result = await outlook.reply(threadId, body.message.trim());
      return NextResponse.json({ ok: true, result });
    }

    // Zernio reply
    const z = getClient();
    const result = await z.sendMessage(conversationId, body.accountId, body.message.trim());
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return errorResponse(e);
  }
}

async function z_listMessages(conversationId: string, accountId: string): Promise<unknown[]> {
  const z = getClient();
  const res = await z.listMessages(conversationId, { accountId, limit: 100, sortOrder: "asc" });
  return coerceArray(res);
}
