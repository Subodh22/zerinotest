/**
 * Gmail API client using OAuth2.
 *
 * Uses Google's REST API directly (no SDK dependency).
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in env.
 *
 * API docs: https://developers.google.com/gmail/api/reference/rest
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// ── OAuth helpers ────────────────────────────────────────────────────────────

export function getAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Token exchange failed");
  return json;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class GmailClient {
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
  ) {
    if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN is not set — visit /api/auth/google to authorize");
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
    this.tokenExpiry = Date.now() + (json.expires_in - 60) * 1000; // refresh 60s early
    return this.accessToken!;
  }

  /** Core API request. */
  private async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(GMAIL_API + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* leave as text */
    }

    if (!res.ok) {
      throw new Error(`Gmail ${method} ${path} -> ${res.status}: ${typeof parsed === "object" ? JSON.stringify(parsed) : text}`);
    }
    return parsed as T;
  }

  /** Get the authenticated user's email address. */
  async getProfile(): Promise<{ emailAddress: string }> {
    return this.request("GET", "/users/me/profile");
  }

  /** List threads (conversations). */
  async listThreads(params: { maxResults?: number; q?: string; pageToken?: string } = {}) {
    return this.request<{
      threads?: { id: string; snippet: string; historyId: string }[];
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>("GET", "/users/me/threads", {
      query: {
        maxResults: String(params.maxResults ?? 20),
        q: params.q,
        pageToken: params.pageToken,
      },
    });
  }

  /** Get a full thread with messages. */
  async getThread(threadId: string, format: "full" | "metadata" | "minimal" = "full") {
    return this.request<GmailThread>("GET", `/users/me/threads/${encodeURIComponent(threadId)}`, {
      query: { format },
    });
  }

  /** Send a reply to a thread. */
  async sendReply(threadId: string, to: string, subject: string, body: string, messageId?: string) {
    const raw = buildRawEmail({ to, subject, body, threadId, inReplyTo: messageId });
    return this.request("POST", "/users/me/messages/send", {
      body: { raw, threadId },
    });
  }
}

// ── Gmail types ──────────────────────────────────────────────────────────────

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: {
    mimeType: string;
    headers: { name: string; value: string }[];
    body?: { size: number; data?: string };
    parts?: GmailPart[];
  };
  internalDate: string;
  sizeEstimate: number;
}

export interface GmailPart {
  mimeType: string;
  headers?: { name: string; value: string }[];
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
  filename?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a header value from a Gmail message. */
export function getHeader(msg: GmailMessage, name: string): string | undefined {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Decode base64url-encoded body data. */
export function decodeBody(data?: string): string {
  if (!data) return "";
  // base64url → base64 → decode
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

/** Extract plain text body from a message. */
export function getTextBody(msg: GmailMessage): string {
  // Try top-level body
  if (msg.payload.body?.data) return decodeBody(msg.payload.body.data);
  // Walk parts for text/plain
  return findTextPart(msg.payload.parts) || msg.snippet;
}

function findTextPart(parts?: GmailPart[]): string {
  if (!parts) return "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBody(part.body.data);
    }
    if (part.parts) {
      const found = findTextPart(part.parts);
      if (found) return found;
    }
  }
  return "";
}

/** Build a base64url-encoded RFC 2822 email for sending. */
function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.inReplyTo}`);
  }
  lines.push("", opts.body);
  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}
