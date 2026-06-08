import { NextResponse } from "next/server";
import { exchangeCode } from "@/src/outlook";
import { requireUserId, upsertAccount } from "@/lib/user-accounts";
import { OutlookClient } from "@/src/outlook";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/outlook/callback — OAuth callback.
 * Exchanges the code for tokens and stores the refresh token in the DB for the
 * logged-in user, then redirects back to the settings page.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Outlook OAuth error: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/outlook/callback`;
    const tokens = await exchangeCode(code, redirectUri);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: "No refresh token returned — ensure offline_access scope is granted" },
        { status: 400 },
      );
    }

    // Get the email address to use as a label
    const clientId = process.env.MS_CLIENT_ID!;
    const clientSecret = process.env.MS_CLIENT_SECRET!;
    const outlook = new OutlookClient(clientId, clientSecret, tokens.refresh_token);
    const profile = await outlook.getProfile();

    await upsertAccount(userId, "outlook", tokens.refresh_token, profile.emailAddress);

    return NextResponse.redirect(new URL("/settings", origin));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
