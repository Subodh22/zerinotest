import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";
import { getGmailClient } from "@/lib/gmail-server";
import { getSlackClient } from "@/lib/slack-server";
import { getOutlookClient } from "@/lib/outlook-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const z = getClient();
    const raw = coerceArray(await z.listAccounts()) as Record<string, unknown>[];
    // Only send the browser what the UI needs — not emails, tokens, or profile blobs.
    const accounts = raw.map((a) => ({
      _id: a._id ?? a.id ?? a.accountId,
      platform: a.platform,
      displayName: a.displayName ?? a.name ?? a.username,
      profilePicture: a.profilePicture ?? null,
    }));

    // Add Gmail account if configured
    const gmail = getGmailClient();
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

    // Add Slack account if configured
    const slack = getSlackClient();
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

    // Add Outlook account if configured
    const outlook = getOutlookClient();
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
    return errorResponse(e);
  }
}
