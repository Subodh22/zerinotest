import { NextResponse } from "next/server";
import { getAuthUrl } from "@/src/gmail";

export const dynamic = "force-dynamic";

/** GET /api/auth/google — redirect to Google OAuth consent screen. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  return NextResponse.redirect(getAuthUrl(redirectUri));
}
