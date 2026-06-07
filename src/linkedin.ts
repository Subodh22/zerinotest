/**
 * LinkedIn Messaging client using the LinkedIn API (OAuth2).
 *
 * Uses the LinkedIn REST API directly (no SDK dependency).
 * Requires LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REFRESH_TOKEN in env.
 *
 * The refresh token is obtained once via the /api/auth/linkedin flow (which
 * prints it) and pasted into the environment — the same model as Outlook/Gmail.
 * This keeps it Vercel-compatible: nothing is written to the filesystem at runtime.
 *
 * API docs: https://learn.microsoft.com/en-us/linkedin/
 */

const LINKEDIN_API = "https://api.linkedin.com";

export const LINKEDIN_SCOPES = "openid profile email w_member_social";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

// ── OAuth helpers (used by the one-time bootstrap routes) ─────────────────────

export function getAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: LINKEDIN_SCOPES,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Token exchange failed");
  return json;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class LinkedInClient {
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private personUrn: string | null = null; // cached authenticated user URN

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
  ) {
    if (!refreshToken)
      throw new Error("LINKEDIN_REFRESH_TOKEN is not set — visit /api/auth/linkedin to authorize");
  }

  /** Get a valid access token, refreshing if needed. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error_description || json.error || "Token refresh failed");

    this.accessToken = json.access_token;
    this.tokenExpiry = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken!;
  }

  /** Core LinkedIn API request. */
  private async request<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; version?: string } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const baseUrl = path.startsWith("http") ? "" : LINKEDIN_API;
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "LinkedIn-Version": opts.version ?? "202405",
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
        (parsed as { message?: string })?.message ||
        (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
      throw new Error(`LinkedIn ${method} ${path} -> ${res.status}: ${detail}`);
    }
    return parsed as T;
  }

  /** The signed-in user's person URN (cached). */
  private async myUrn(): Promise<string> {
    if (this.personUrn) return this.personUrn;
    const me = await this.request<{ sub?: string }>("GET", "/v2/userinfo");
    this.personUrn = `urn:li:person:${me.sub}`;
    return this.personUrn;
  }

  /** Authenticated user's profile. */
  async getProfile(): Promise<{ emailAddress: string; displayName: string; sub: string }> {
    const me = await this.request<{
      sub?: string;
      name?: string;
      email?: string;
      given_name?: string;
      family_name?: string;
    }>("GET", "/v2/userinfo");
    const emailAddress = me.email || "linkedin-user";
    const displayName = me.name || [me.given_name, me.family_name].filter(Boolean).join(" ") || emailAddress;
    return { emailAddress, displayName, sub: me.sub || "" };
  }

  /** Inbox conversations (messaging threads), newest first. */
  async listConversations(limit = 30): Promise<LinkedInConversation[]> {
    const myUrn = await this.myUrn();
    const res = await this.request<{
      elements?: LinkedInApiConversation[];
    }>("GET", `/rest/conversations?q=criteria&recipients=List(${encodeURIComponent(myUrn)})&count=${limit}&sortCriteria=LAST_ACTIVITY_AT_DESC`);

    return (res.elements ?? []).map((c) => {
      const participants = (c.conversationParticipants ?? [])
        .map((p) => p.participantType?.member ?? "")
        .filter((urn) => urn && urn !== myUrn);
      const otherName =
        c.conversationParticipants?.find(
          (p) => (p.participantType?.member ?? "") !== myUrn,
        )?.participantType?.memberName ?? participants[0] ?? "Unknown";

      return {
        conversationId: c.entityUrn ?? c["*conversation"] ?? "",
        participantName: typeof otherName === "object"
          ? ((otherName as { firstName?: string; lastName?: string }).firstName ?? "") +
            " " +
            ((otherName as { firstName?: string; lastName?: string }).lastName ?? "")
          : String(otherName),
        preview: c.lastMessage?.body?.text ?? "",
        updatedTime: c.lastActivityAt ? new Date(c.lastActivityAt).toISOString() : undefined,
        unread: c.read === false ? 1 : 0,
      };
    });
  }

  /** All messages in a conversation thread, oldest first. */
  async listThreadMessages(conversationId: string): Promise<LinkedInMessage[]> {
    const myUrn = await this.myUrn();
    const res = await this.request<{
      elements?: LinkedInApiMessage[];
    }>("GET", `/rest/messages?q=criteria&conversationId=${encodeURIComponent(conversationId)}&sortCriteria=CREATED_AT_ASC&count=100`);

    return (res.elements ?? []).map((m) => {
      const senderUrn = m.sender?.participantType?.member ?? "";
      return {
        id: m.entityUrn ?? m["*message"] ?? "",
        fromName: m.sender?.participantType?.memberName
          ? typeof m.sender.participantType.memberName === "object"
            ? ((m.sender.participantType.memberName as { firstName?: string }).firstName ?? "") +
              " " +
              ((m.sender.participantType.memberName as { lastName?: string }).lastName ?? "")
            : String(m.sender.participantType.memberName)
          : "Unknown",
        body: m.body?.text ?? "",
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
        fromMe: senderUrn === myUrn,
      };
    });
  }

  /** Send a message in an existing conversation. */
  async reply(conversationId: string, messageText: string): Promise<unknown> {
    const myUrn = await this.myUrn();
    return this.request("POST", "/rest/messages", {
      body: {
        conversationId,
        body: { text: messageText },
        sender: { participantType: { member: myUrn } },
      },
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface LinkedInApiParticipant {
  participantType?: {
    member?: string;
    memberName?: unknown;
  };
}

interface LinkedInApiConversation {
  entityUrn?: string;
  "*conversation"?: string;
  conversationParticipants?: LinkedInApiParticipant[];
  lastMessage?: { body?: { text?: string } };
  lastActivityAt?: number;
  read?: boolean;
}

interface LinkedInApiMessage {
  entityUrn?: string;
  "*message"?: string;
  body?: { text?: string };
  sender?: LinkedInApiParticipant;
  createdAt?: number;
}

export interface LinkedInConversation {
  conversationId: string;
  participantName: string;
  preview: string;
  updatedTime?: string;
  unread: number;
}

export interface LinkedInMessage {
  id: string;
  fromName: string;
  body: string;
  createdAt?: string;
  fromMe: boolean;
}
