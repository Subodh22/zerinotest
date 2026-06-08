import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Per-user connected accounts.
 * Each row stores one OAuth integration (gmail, outlook, slack) for one Clerk user.
 * The Zernio API key is shared (env var), not stored per-user.
 */
export const connectedAccounts = sqliteTable("connected_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Clerk user ID (e.g. "user_2x...") */
  userId: text("user_id").notNull(),
  /** Provider: "gmail" | "outlook" | "slack" */
  provider: text("provider").notNull(),
  /** Human-friendly label (email address, team name, etc.) */
  label: text("label"),
  /** OAuth refresh token (Gmail, Outlook) or bot token (Slack) */
  refreshToken: text("refresh_token").notNull(),
  /** Optional: access token cache */
  accessToken: text("access_token"),
  /** Optional: token expiry as unix ms */
  tokenExpiry: integer("token_expiry"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type NewConnectedAccount = typeof connectedAccounts.$inferInsert;
