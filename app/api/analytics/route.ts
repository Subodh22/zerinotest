import { NextResponse } from "next/server";
import { getClient, errorResponse } from "@/lib/zernio-server";
import { requireUserId, AuthRequiredError } from "@/lib/user-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUserId();
    const z = getClient();
    const data = (await z.getAnalytics({ limit: 10 })) as { overview?: unknown };
    return NextResponse.json({ overview: data?.overview ?? null });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return errorResponse(e);
  }
}
