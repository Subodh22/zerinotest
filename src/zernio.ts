/**
 * Minimal Zernio API client.
 *
 * Docs:     https://docs.zernio.com   (OpenAPI: https://zernio.com/openapi.yaml)
 * Base URL: https://zernio.com/api/v1   (server is /api, all paths are /v1/...)
 * Auth:     Authorization: Bearer sk_...
 *
 * Dependency-free — uses Node 18+ global fetch. Endpoint paths and required
 * params below are taken from the published OpenAPI 3.1 spec (v1.0.4).
 */

const DEFAULT_BASE_URL = "https://zernio.com/api/v1";

export class ZernioError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ZernioError";
  }
}

export class ZernioClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
    if (!apiKey) throw new Error("Zernio API key is required");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /** Core request. Returns parsed JSON (or text fallback). Throws ZernioError on non-2xx. */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* leave as text (e.g. an HTML 404 page) */
    }

    if (!res.ok) {
      throw new ZernioError(
        `${method} ${path} -> ${res.status} ${res.statusText}`,
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }

  // ---- Read endpoints ----

  /** GET /accounts — list connected social accounts. */
  listAccounts() {
    return this.request("GET", "/accounts");
  }

  /**
   * GET /inbox/conversations — unified DM conversations across accounts.
   * DM-capable platforms: facebook, instagram, twitter, bluesky, reddit, telegram.
   * Returns { data, pagination, meta }. `meta.failedAccounts` explains empty results.
   */
  listConversations(
    params: {
      platform?: "facebook" | "instagram" | "twitter" | "bluesky" | "reddit" | "telegram";
      profileId?: string;
      accountId?: string;
      status?: "active" | "archived";
      sortOrder?: "asc" | "desc";
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    return this.request("GET", "/inbox/conversations", { query: params });
  }

  /**
   * GET /inbox/conversations/{conversationId}/messages — messages in a thread.
   * `accountId` is REQUIRED. Default sort is oldest-first; use sortOrder=desc for latest.
   */
  listMessages(
    conversationId: string,
    params: { accountId: string; limit?: number; cursor?: string; sortOrder?: "asc" | "desc" },
  ) {
    return this.request(
      "GET",
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: params },
    );
  }

  /** GET /inbox/comments/{postId} — comments on a post. `accountId` REQUIRED. */
  listPostComments(postId: string, params: { accountId: string; limit?: number; cursor?: string }) {
    return this.request("GET", `/inbox/comments/${encodeURIComponent(postId)}`, { query: params });
  }

  /**
   * GET /analytics — post analytics. Without postId returns a paginated list with an
   * `overview`. fromDate defaults to 90 days ago; max range 366 days.
   */
  getAnalytics(
    params: {
      postId?: string;
      platform?: string;
      accountId?: string;
      profileId?: string;
      source?: "all" | "late" | "external";
      fromDate?: string;
      toDate?: string;
      limit?: number;
      page?: number;
      sortBy?: string;
      order?: "asc" | "desc";
    } = {},
  ) {
    return this.request("GET", "/analytics", { query: params });
  }

  // ---- Write endpoints (for the real app; explorer never calls these) ----

  /** POST /inbox/conversations/{conversationId}/messages — send a DM. */
  sendMessage(conversationId: string, accountId: string, message: string) {
    return this.request(
      "POST",
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      { body: { accountId, message } },
    );
  }

  /** POST /inbox/comments/{postId} — reply to a post/comment. */
  replyToComment(postId: string, accountId: string, message: string, commentId?: string) {
    return this.request("POST", `/inbox/comments/${encodeURIComponent(postId)}`, {
      body: { accountId, message, commentId },
    });
  }

  /** POST /inbox/conversations/{conversationId}/read — mark a conversation read. */
  markRead(conversationId: string, accountId: string) {
    return this.request("POST", `/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
      body: { accountId },
    });
  }
}

/**
 * Normalizes list payloads whether the API returns a bare array or wraps it in a
 * common envelope key ({data: [...]}, {accounts: [...]}, {conversations: [...]}).
 */
export function coerceArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "accounts", "conversations", "messages", "comments", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}
