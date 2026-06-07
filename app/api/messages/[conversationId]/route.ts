import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import { getGmailClient } from "@/lib/gmail-server";
import { getSlackClient } from "@/lib/slack-server";
import { getOutlookClient } from "@/lib/outlook-server";
import { getLinkedInClient } from "@/lib/linkedin-server";
import { getHeader, getTextBody } from "@/src/gmail";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ conversationId: string }> };

// GET /api/messages/{conversationId}?accountId=...  — read a thread
export async function GET(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    // Gmail thread
    if (conversationId.startsWith("gmail:")) {
      const gmail = getGmailClient();
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
      const slack = getSlackClient();
      if (!slack) {
        return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
      }
      const channelId = conversationId.replace("slack:", "");
      const auth = await slack.authTest();
      const history = await slack.conversationHistory(channelId, { limit: 100 });

      // Resolve user names
      const userIds = [...new Set(history.messages.filter((m) => m.user).map((m) => m.user!))];
      const users = await slack.usersInfo(userIds);

      const messages: Message[] = history.messages
        .filter((m) => !m.subtype) // skip system messages
        .reverse() // oldest first
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
      const outlook = getOutlookClient();
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

    // LinkedIn thread
    if (conversationId.startsWith("linkedin:")) {
      const linkedin = getLinkedInClient();
      if (!linkedin) {
        return NextResponse.json({ error: "LinkedIn not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("linkedin:", "");
      const thread = await linkedin.listThreadMessages(threadId);
      const messages: Message[] = thread.map((m) => ({
        id: m.id,
        message: m.body,
        senderId: undefined,
        senderName: m.fromMe ? null : m.fromName,
        direction: m.fromMe ? "outgoing" : "incoming",
        createdAt: m.createdAt,
        attachments: [],
        deliveryStatus: null,
      }));
      return NextResponse.json({ data: messages });
    }

    // Zernio thread
    const res = await z_listMessages(conversationId, accountId);
    return NextResponse.json({ data: res });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/messages/{conversationId}  body: { accountId, message }  — send a reply
export async function POST(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const body = (await req.json()) as { accountId?: string; message?: string };
    if (!body.accountId || !body.message?.trim()) {
      return NextResponse.json({ error: "accountId and message are required" }, { status: 400 });
    }

    // Gmail reply
    if (conversationId.startsWith("gmail:")) {
      const gmail = getGmailClient();
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
      const slack = getSlackClient();
      if (!slack) {
        return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
      }
      const channelId = conversationId.replace("slack:", "");
      const result = await slack.postMessage(channelId, body.message.trim());
      return NextResponse.json({ ok: true, result });
    }

    // Outlook reply
    if (conversationId.startsWith("outlook:")) {
      const outlook = getOutlookClient();
      if (!outlook) {
        return NextResponse.json({ error: "Outlook not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("outlook:", "");
      const result = await outlook.reply(threadId, body.message.trim());
      return NextResponse.json({ ok: true, result });
    }

    // LinkedIn reply
    if (conversationId.startsWith("linkedin:")) {
      const linkedin = getLinkedInClient();
      if (!linkedin) {
        return NextResponse.json({ error: "LinkedIn not configured" }, { status: 500 });
      }
      const threadId = conversationId.replace("linkedin:", "");
      const result = await linkedin.reply(threadId, body.message.trim());
      return NextResponse.json({ ok: true, result });
    }

    // Zernio reply
    const z = getClient();
    const result = await z.sendMessage(conversationId, body.accountId, body.message.trim());
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}

async function z_listMessages(conversationId: string, accountId: string): Promise<unknown[]> {
  const z = getClient();
  // Oldest-first so the thread reads top-to-bottom like a chat.
  const res = await z.listMessages(conversationId, { accountId, limit: 100, sortOrder: "asc" });
  return coerceArray(res);
}
