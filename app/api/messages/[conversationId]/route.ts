import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import { getGmailClient } from "@/lib/gmail-server";
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
