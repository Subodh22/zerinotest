import { NextResponse } from "next/server";
import { getAuthUrl } from "@/src/linkedin";

export const dynamic = "force-dynamic";

/** GET /api/auth/linkedin — redirect to the LinkedIn consent screen. */
export async function GET(req: Request) {
  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in your environment first" },
      { status: 500 },
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/linkedin/callback`;
  return NextResponse.redirect(getAuthUrl(redirectUri));
}
