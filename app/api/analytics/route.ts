import { NextResponse } from "next/server";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const z = getClient();
    const data = (await z.getAnalytics({ limit: 10 })) as { overview?: unknown };
    return NextResponse.json({ overview: data?.overview ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
