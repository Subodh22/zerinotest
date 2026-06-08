import { NextResponse } from "next/server";
import { exchangeCode } from "@/src/gmail";
import { requireUserId, upsertAccount } from "@/lib/user-accounts";
import { GmailClient } from "@/src/gmail";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — OAuth callback.
 * Exchanges the code for tokens and stores the refresh token in the DB for the
 * logged-in user, then redirects back to the settings page.
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
    const userId = await requireUserId();
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: "No refresh token returned — revoke access at https://myaccount.google.com/permissions and retry" },
        { status: 400 },
      );
    }

    // Get the email address to use as a label
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const gmail = new GmailClient(clientId, clientSecret, tokens.refresh_token);
    const profile = await gmail.getProfile();

    await upsertAccount(userId, "gmail", tokens.refresh_token, profile.emailAddress);

    return NextResponse.redirect(new URL("/settings", origin));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
