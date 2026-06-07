import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ postId: string }> };

// GET /api/comments/{postId}?accountId=...  — fetch comments on a post
export async function GET(req: Request, { params }: Params) {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const z = getClient();
    const res = await z.listPostComments(postId, { accountId, limit: 100 });
    // Normalize: flatten `from` object and alias `createdTime` → `createdAt`.
    const comments = (coerceArray(res) as Record<string, unknown>[]).map((c) => {
      const from = c.from as Record<string, string> | string | undefined;
      const senderName =
        c.senderName ??
        (typeof from === "object" && from !== null
          ? from.name ?? from.username
          : from);
      return {
        ...c,
        senderName,
        createdAt: c.createdAt ?? c.createdTime,
      };
    });
    return NextResponse.json({ data: comments });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/comments/{postId}  body: { accountId, message, commentId? }  — reply to a comment
export async function POST(req: Request, { params }: Params) {
  try {
    const { postId } = await params;
    const body = (await req.json()) as {
      accountId?: string;
      message?: string;
      commentId?: string;
    };
    if (!body.accountId || !body.message?.trim()) {
      return NextResponse.json({ error: "accountId and message are required" }, { status: 400 });
    }

    const z = getClient();
    const result = await z.replyToComment(
      postId,
      body.accountId,
      body.message.trim(),
      body.commentId,
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
