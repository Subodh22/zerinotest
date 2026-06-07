/**
 * Outlook Mail client using Microsoft Graph (OAuth2).
 *
 * Uses the Graph REST API directly (no SDK dependency).
 * Requires MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REFRESH_TOKEN in env.
 * MS_TENANT_ID is optional (defaults to "common").
 *
 * The refresh token is obtained once via the /api/auth/outlook flow (which
 * prints it) and pasted into the environment — the same model as Gmail. This
 * keeps it Vercel-compatible: nothing is written to the filesystem at runtime.
 *
 * API docs: https://learn.microsoft.com/graph/api/resources/mail-api-overview
 */

const GRAPH_API = "https://graph.microsoft.com/v1.0";

export const OUTLOOK_SCOPES = "openid offline_access User.Read Mail.Read Mail.Send";

function tenant(): string {
  return process.env.MS_TENANT_ID || "common";
}
function tokenUrl(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}
function authUrlBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}

// ── OAuth helpers (used by the one-time bootstrap routes) ─────────────────────

export function getAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES,
    prompt: "consent",
  });
  return `${authUrlBase()}?${params}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: OUTLOOK_SCOPES,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Token exchange failed");
  return json;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class OutlookClient {
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private address: string | null = null; // signed-in user's email, cached

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
  ) {
    if (!refreshToken)
      throw new Error("MS_REFRESH_TOKEN is not set — visit /api/auth/outlook to authorize");
  }

  /** Get a valid access token, refreshing if needed. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
        scope: OUTLOOK_SCOPES,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error_description || json.error || "Token refresh failed");

    this.accessToken = json.access_token;
    this.tokenExpiry = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000; // refresh 60s early
    return this.accessToken!;
  }

  /** Core Graph request. */
  private async request<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; text?: boolean } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(GRAPH_API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        // Ask Graph for plain-text bodies so the UI renders them without HTML handling.
        ...(opts.text ? { Prefer: 'outlook.body-content-type="text"' } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* leave as text */
    }
    if (!res.ok) {
      const detail =
        (parsed as { error?: { message?: string } })?.error?.message ||
        (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
      throw new Error(`Outlook ${method} ${path} -> ${res.status}: ${detail}`);
    }
    return parsed as T;
  }

  /** The signed-in user's email address (cached). */
  private async myAddress(): Promise<string> {
    if (this.address) return this.address;
    const me = await this.request<{ mail?: string; userPrincipalName?: string }>("GET", "/me");
    this.address = (me.mail || me.userPrincipalName || "").toLowerCase();
    return this.address;
  }

  /** Authenticated user's profile. */
  async getProfile(): Promise<{ emailAddress: string; displayName: string }> {
    const me = await this.request<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
      "GET",
      "/me",
    );
    const emailAddress = me.mail || me.userPrincipalName || "Outlook";
    return { emailAddress, displayName: me.displayName || emailAddress };
  }

  /** Inbox conversations (email threads), newest first. */
  async listConversations(limit = 30): Promise<OutlookConversation[]> {
    const me = await this.myAddress();
    const select = "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,webLink";
    const res = await this.request<{ value: GraphMessage[] }>(
      "GET",
      `/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=${encodeURIComponent(
        select,
      )}`,
    );

    // Collapse the flat message list into one entry per thread.
    const byThread = new Map<string, { latest: GraphMessage; unread: number }>();
    for (const m of res.value) {
      const key = m.conversationId || m.id;
      const entry = byThread.get(key);
      const unread = m.isRead ? 0 : 1;
      if (!entry) {
        byThread.set(key, { latest: m, unread });
      } else {
        entry.unread += unread;
        if (new Date(m.receivedDateTime ?? 0) > new Date(entry.latest.receivedDateTime ?? 0)) {
          entry.latest = m;
        }
      }
    }

    return [...byThread.values()].map(({ latest, unread }) => {
      const from = latest.from?.emailAddress;
      const fromAddr = (from?.address || "").toLowerCase();
      // If the newest message is one you sent, show the recipient instead.
      const other = fromAddr && fromAddr === me ? latest.toRecipients?.[0]?.emailAddress : from;
      return {
        conversationId: latest.conversationId || latest.id,
        participantName: other?.name || other?.address || "Unknown sender",
        subject: latest.subject || "(no subject)",
        preview: latest.bodyPreview || "",
        updatedTime: latest.receivedDateTime,
        unread,
        webLink: latest.webLink ?? null,
      };
    });
  }

  /** All messages in a thread, oldest first. */
  async listThreadMessages(conversationId: string): Promise<OutlookMessage[]> {
    const me = await this.myAddress();
    const select = "id,from,subject,body,bodyPreview,receivedDateTime";
    const filter = `conversationId eq '${conversationId.replace(/'/g, "''")}'`;
    const res = await this.request<{ value: GraphMessage[] }>(
      "GET",
      `/me/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime asc&$select=${encodeURIComponent(
        select,
      )}`,
      { text: true },
    );
    return res.value.map((m) => {
      const fromAddr = (m.from?.emailAddress?.address || "").toLowerCase();
      return {
        id: m.id,
        fromName: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
        body: m.body?.content?.trim() || m.bodyPreview || "",
        receivedDateTime: m.receivedDateTime,
        fromMe: !!fromAddr && fromAddr === me,
      };
    });
  }

  /** Reply to the newest message in a thread (keeps it threaded). */
  async reply(conversationId: string, comment: string): Promise<unknown> {
    const filter = `conversationId eq '${conversationId.replace(/'/g, "''")}'`;
    const res = await this.request<{ value: { id: string }[] }>(
      "GET",
      `/me/messages?$filter=${encodeURIComponent(
        filter,
      )}&$orderby=receivedDateTime desc&$top=1&$select=id`,
    );
    const latestId = res.value[0]?.id;
    if (!latestId) throw new Error("No message found to reply to in this thread");
    return this.request("POST", `/me/messages/${encodeURIComponent(latestId)}/reply`, {
      body: { comment },
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphAddress {
  name?: string;
  address?: string;
}
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: GraphAddress };
  toRecipients?: { emailAddress?: GraphAddress }[];
  receivedDateTime?: string;
  isRead?: boolean;
  webLink?: string;
}

export interface OutlookConversation {
  conversationId: string;
  participantName: string;
  subject: string;
  preview: string;
  updatedTime?: string;
  unread: number;
  webLink: string | null;
}

export interface OutlookMessage {
  id: string;
  fromName: string;
  body: string;
  receivedDateTime?: string;
  fromMe: boolean;
}
