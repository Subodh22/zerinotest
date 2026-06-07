import { NextResponse } from "next/server";
import { exchangeCode } from "@/src/gmail";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — OAuth callback.
 * Exchanges the authorization code for tokens and displays the refresh token
 * so it can be added to Vercel env vars (or .env locally).
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

    const refreshToken = tokens.refresh_token ?? "Not returned (already authorized — revoke access at https://myaccount.google.com/permissions and retry)";

    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:3rem;max-width:640px;margin:0 auto">
        <h2 style="color:#16a34a">Gmail connected ✓</h2>
        <p>Copy the refresh token below and add it as <code>GOOGLE_REFRESH_TOKEN</code> in your Vercel project settings (or <code>.env</code> locally), then redeploy.</p>
        <label style="font-weight:600;display:block;margin-top:1.5rem">Refresh Token:</label>
        <textarea id="rt" readonly onclick="this.select()" style="width:100%;height:80px;font-family:monospace;font-size:13px;padding:0.75rem;border:1px solid #d4d4d4;border-radius:8px;background:#fafafa;margin-top:0.5rem">${refreshToken}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('rt').value)" style="margin-top:0.75rem;padding:0.5rem 1.25rem;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Copy to clipboard</button>
        <p style="margin-top:1.5rem;font-size:14px;color:#737373">After setting the env var and redeploying, visit <a href="/">the inbox</a> to see Gmail threads.</p>
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
