import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import {
  requireUserId,
  getGmailClientForUser,
  getSlackClientForUser,
  getOutlookClientForUser,
  AuthRequiredError,
} from "@/lib/user-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const z = getClient();
    const raw = coerceArray(await z.listAccounts()) as Record<string, unknown>[];
    const accounts = raw.map((a) => ({
      _id: a._id ?? a.id ?? a.accountId,
      platform: a.platform,
      displayName: a.displayName ?? a.name ?? a.username,
      profilePicture: a.profilePicture ?? null,
    }));

    // Add Gmail account if user has connected it
    const gmail = await getGmailClientForUser(userId);
    if (gmail) {
      try {
        const profile = await gmail.getProfile();
        accounts.push({
          _id: `gmail:${profile.emailAddress}`,
          platform: "google",
          displayName: profile.emailAddress,
          profilePicture: null,
        });
      } catch {
        // Gmail not ready — skip silently
      }
    }

    // Add Slack account if user has connected it
    const slack = await getSlackClientForUser(userId);
    if (slack) {
      try {
        const auth = await slack.authTest();
        accounts.push({
          _id: `slack:${auth.team_id}`,
          platform: "slack",
          displayName: `${auth.team} (Slack)`,
          profilePicture: null,
        });
      } catch {
        // Slack not ready — skip silently
      }
    }

    // Add Outlook account if user has connected it
    const outlook = await getOutlookClientForUser(userId);
    if (outlook) {
      try {
        const profile = await outlook.getProfile();
        accounts.push({
          _id: `outlook:${profile.emailAddress}`,
          platform: "outlook",
          displayName: profile.emailAddress,
          profilePicture: null,
        });
      } catch {
        // Outlook not ready — skip silently
      }
    }

    return NextResponse.json({ accounts });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return errorResponse(e);
  }
}
