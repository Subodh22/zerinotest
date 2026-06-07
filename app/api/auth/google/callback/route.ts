import { NextResponse } from "next/server";
import { exchangeCode } from "@/src/gmail";
import { appendFileSync } from "fs";
import { resolve } from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — OAuth callback.
 * Exchanges the authorization code for tokens and saves the refresh token to .env.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Google OAuth error: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);

    if (tokens.refresh_token) {
      // Persist the refresh token to .env
      const envPath = resolve(process.cwd(), ".env");
      const envContent = (await import("fs")).readFileSync(envPath, "utf-8");
      const updated = envContent.replace(
        /^GOOGLE_REFRESH_TOKEN=.*$/m,
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`,
      );
      (await import("fs")).writeFileSync(envPath, updated, "utf-8");
    }

    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:3rem;text-align:center">
        <h2>Gmail connected</h2>
        <p>Refresh token saved to .env. Restart the dev server to pick it up, then visit <a href="/">the inbox</a>.</p>
        <pre style="background:#f5f5f5;padding:1rem;border-radius:8px;display:inline-block;text-align:left">${tokens.refresh_token ? "refresh_token: saved ✓" : "refresh_token: not returned (already authorized — revoke and retry if needed)"}\naccess_token: ${tokens.access_token ? "received ✓" : "missing"}</pre>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
