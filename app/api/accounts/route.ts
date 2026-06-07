import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const z = getClient();
    const raw = coerceArray(await z.listAccounts()) as Record<string, unknown>[];
    // Only send the browser what the UI needs — not emails, tokens, or profile blobs.
    const accounts = raw.map((a) => ({
      _id: a._id ?? a.id ?? a.accountId,
      platform: a.platform,
      displayName: a.displayName ?? a.name ?? a.username,
      profilePicture: a.profilePicture ?? null,
    }));
    return NextResponse.json({ accounts });
  } catch (e) {
    return errorResponse(e);
  }
}
