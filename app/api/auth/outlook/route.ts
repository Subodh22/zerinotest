import { NextResponse } from "next/server";
import { getAuthUrl } from "@/src/outlook";

export const dynamic = "force-dynamic";

/** GET /api/auth/outlook — redirect to the Microsoft Graph consent screen. */
export async function GET(req: Request) {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Set MS_CLIENT_ID and MS_CLIENT_SECRET in your environment first" },
      { status: 500 },
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/outlook/callback`;
  return NextResponse.redirect(getAuthUrl(redirectUri));
}
