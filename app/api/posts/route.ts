import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const z = getClient();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") || undefined;
    const accountId = searchParams.get("accountId") || undefined;

    const data = (await z.getAnalytics({ limit: 50, platform, accountId })) as {
      overview?: unknown;
      data?: unknown[];
      posts?: unknown[];
    };

    const posts = data?.data ?? data?.posts ?? coerceArray(data);
    return NextResponse.json({ data: posts, overview: data?.overview ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
