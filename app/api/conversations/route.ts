import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

type Platform = "facebook" | "instagram" | "twitter" | "bluesky" | "reddit" | "telegram";

export async function GET(req: Request) {
  try {
    const z = getClient();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") as Platform | null;

    const res = (await z.listConversations({
      limit: 50,
      ...(platform ? { platform } : {}),
    })) as { data?: unknown[]; meta?: unknown };

    return NextResponse.json({
      data: res?.data ?? coerceArray(res),
      meta: res?.meta ?? null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
