import { NextResponse } from "next/server";
import { authorizeUrl, isOutlookConfigured } from "@/lib/sources/outlook-auth";

export const dynamic = "force-dynamic";

// GET /api/auth/outlook/login — kick off the Microsoft Graph consent flow.
export async function GET() {
  if (!isOutlookConfigured()) {
    return NextResponse.json(
      { error: "Outlook is not configured — set MS_CLIENT_ID and MS_CLIENT_SECRET in .env" },
      { status: 500 },
    );
  }
  return NextResponse.redirect(authorizeUrl());
}
