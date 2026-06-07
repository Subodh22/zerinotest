import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

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
