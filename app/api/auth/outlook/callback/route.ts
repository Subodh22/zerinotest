import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/sources/outlook-auth";

export const dynamic = "force-dynamic";

// GET /api/auth/outlook/callback — Microsoft redirects here with ?code=...
// We swap the code for tokens, persist them, then bounce back to the inbox.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const error = searchParams.get("error_description") || searchParams.get("error");
  const code = searchParams.get("code");

  if (error) {
    return NextResponse.redirect(`${origin}/?outlook=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?outlook=error&reason=missing_code`);
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(`${origin}/?outlook=connected`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "token_exchange_failed";
    return NextResponse.redirect(`${origin}/?outlook=error&reason=${encodeURIComponent(reason)}`);
  }
}
