import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { GmailClient } from "@/src/gmail";
import { OutlookClient } from "@/src/outlook";
import { SlackClient } from "@/src/slack";
import type { ConnectedAccount } from "@/lib/db/schema";

/**
 * Get the authenticated Clerk user ID, or throw a 401-style error.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new AuthRequiredError();
  return userId;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthRequiredError";
  }
}

/**
 * Fetch all connected accounts for a user.
 */
export async function getUserAccounts(userId: string): Promise<ConnectedAccount[]> {
  return db
    .select()
    .from(schema.connectedAccounts)
    .where(eq(schema.connectedAccounts.userId, userId));
}

/**
 * Fetch a specific provider account for a user.
 */
export async function getUserAccount(
  userId: string,
  provider: string,
): Promise<ConnectedAccount | undefined> {
  const rows = await db
    .select()
    .from(schema.connectedAccounts)
    .where(
      and(
        eq(schema.connectedAccounts.userId, userId),
        eq(schema.connectedAccounts.provider, provider),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Upsert a connected account (insert or update on userId+provider).
 */
export async function upsertAccount(
  userId: string,
  provider: string,
  refreshToken: string,
  label?: string,
): Promise<void> {
  const existing = await getUserAccount(userId, provider);
  if (existing) {
    await db
      .update(schema.connectedAccounts)
      .set({ refreshToken, label, updatedAt: Date.now() })
      .where(eq(schema.connectedAccounts.id, existing.id));
  } else {
    await db.insert(schema.connectedAccounts).values({
      userId,
      provider,
      refreshToken,
      label,
    });
  }
}

/**
 * Delete a connected account.
 */
export async function deleteAccount(userId: string, provider: string): Promise<void> {
  await db
    .delete(schema.connectedAccounts)
    .where(
      and(
        eq(schema.connectedAccounts.userId, userId),
        eq(schema.connectedAccounts.provider, provider),
      ),
    );
}

// ── Client builders (per-user) ──────────────────────────────────────────────

/**
 * Build a Gmail client for the given user. Returns null if not connected.
 */
export async function getGmailClientForUser(userId: string): Promise<GmailClient | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const account = await getUserAccount(userId, "gmail");
  if (!account) return null;

  return new GmailClient(clientId, clientSecret, account.refreshToken);
}

/**
 * Build an Outlook client for the given user. Returns null if not connected.
 */
export async function getOutlookClientForUser(userId: string): Promise<OutlookClient | null> {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const account = await getUserAccount(userId, "outlook");
  if (!account) return null;

  return new OutlookClient(clientId, clientSecret, account.refreshToken);
}

/**
 * Build a Slack client for the given user. Returns null if not connected.
 */
export async function getSlackClientForUser(userId: string): Promise<SlackClient | null> {
  const account = await getUserAccount(userId, "slack");
  if (!account) return null;

  return new SlackClient(account.refreshToken);
}
