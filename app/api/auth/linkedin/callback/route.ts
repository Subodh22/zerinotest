import { NextResponse } from "next/server";
import { exchangeCode } from "@/src/linkedin";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/linkedin/callback — OAuth callback.
 * Exchanges the authorization code for tokens and displays the refresh token
 * so it can be added to Vercel env vars (or .env locally).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `LinkedIn OAuth error: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/linkedin/callback`;
    const tokens = await exchangeCode(code, redirectUri);

    const refreshToken =
      tokens.refresh_token ??
      "Not returned — LinkedIn may not support refresh tokens for your app type. Use the access token directly.";

    const accessToken = tokens.access_token;
    const expiresIn = tokens.expires_in ? `${Math.round(tokens.expires_in / 86400)} days` : "unknown";

    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:3rem;max-width:640px;margin:0 auto">
        <h2 style="color:#16a34a">LinkedIn connected &#10003;</h2>
        <p>Copy the token below and add it to your Vercel project settings (or <code>.env</code> locally), then redeploy.</p>
        <label style="font-weight:600;display:block;margin-top:1.5rem">Refresh Token:</label>
        <textarea id="rt" readonly onclick="this.select()" style="width:100%;height:80px;font-family:monospace;font-size:13px;padding:0.75rem;border:1px solid #d4d4d4;border-radius:8px;background:#fafafa;margin-top:0.5rem">${refreshToken}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('rt').value)" style="margin-top:0.75rem;padding:0.5rem 1.25rem;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Copy refresh token</button>
        <label style="font-weight:600;display:block;margin-top:1.5rem">Access Token (expires in ~${expiresIn}):</label>
        <textarea id="at" readonly onclick="this.select()" style="width:100%;height:80px;font-family:monospace;font-size:13px;padding:0.75rem;border:1px solid #d4d4d4;border-radius:8px;background:#fafafa;margin-top:0.5rem">${accessToken}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('at').value)" style="margin-top:0.75rem;padding:0.5rem 1.25rem;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Copy access token</button>
        <p style="margin-top:1.5rem;font-size:14px;color:#737373">Set <code>LINKEDIN_REFRESH_TOKEN</code> (or <code>LINKEDIN_ACCESS_TOKEN</code> if no refresh token) in your environment, then visit <a href="/">the inbox</a> to see LinkedIn messages.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
