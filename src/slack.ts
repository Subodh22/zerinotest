/**
 * Slack Web API client.
 *
 * Uses the Slack Web API directly (no SDK dependency).
 * Requires SLACK_BOT_TOKEN (xoxb-...) in env.
 *
 * API docs: https://api.slack.com/methods
 */

const SLACK_API = "https://slack.com/api";

export class SlackClient {
  constructor(private readonly botToken: string) {
    if (!botToken) throw new Error("SLACK_BOT_TOKEN is not set");
  }

  /** Core API request. All Slack Web API methods use POST with JSON or form data. */
  private async request<T = unknown>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const url = `${SLACK_API}/${method}`;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) body.set(k, String(v));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const json = (await res.json()) as SlackResponse & T;
    if (!json.ok) {
      throw new Error(`Slack ${method}: ${json.error ?? "unknown error"}`);
    }
    return json;
  }

  /** Verify token and get bot identity. */
  async authTest() {
    return this.request<{ user_id: string; user: string; team: string; team_id: string }>(
      "auth.test",
    );
  }

  /** List conversations (channels, DMs, group DMs) the bot is in. */
  async listConversations(params: {
    types?: string; // e.g. "im,mpim" for DMs only
    limit?: number;
    cursor?: string;
  } = {}) {
    return this.request<{
      channels: SlackChannel[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.list", {
      types: params.types ?? "im,mpim",
      limit: params.limit ?? 50,
      cursor: params.cursor,
      exclude_archived: true,
    });
  }

  /** Join a channel (public channels only). */
  async joinConversation(channel: string) {
    return this.request("conversations.join", { channel });
  }

  /** Get message history for a conversation. Auto-joins public channels if needed. */
  async conversationHistory(channel: string, params: { limit?: number; cursor?: string } = {}) {
    try {
      return await this.request<{
        messages: SlackMessage[];
        has_more?: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.history", {
        channel,
        limit: params.limit ?? 50,
        cursor: params.cursor,
      });
    } catch (e) {
      // Auto-join and retry if bot isn't in the channel
      if (e instanceof Error && e.message.includes("not_in_channel")) {
        await this.joinConversation(channel);
        return this.request<{
          messages: SlackMessage[];
          has_more?: boolean;
          response_metadata?: { next_cursor?: string };
        }>("conversations.history", {
          channel,
          limit: params.limit ?? 50,
          cursor: params.cursor,
        });
      }
      throw e;
    }
  }

  /** Send a message to a channel/DM. */
  async postMessage(channel: string, text: string) {
    return this.request<{ ts: string; channel: string; message: SlackMessage }>(
      "chat.postMessage",
      { channel, text },
    );
  }

  /** Get user info by ID. */
  async userInfo(userId: string) {
    return this.request<{ user: SlackUser }>("users.info", { user: userId });
  }

  /** Batch-fetch user info for multiple IDs. Returns a map of userId -> SlackUser. */
  async usersInfo(userIds: string[]): Promise<Map<string, SlackUser>> {
    const unique = [...new Set(userIds)];
    const results = await Promise.all(
      unique.map(async (id) => {
        try {
          const res = await this.userInfo(id);
          return [id, res.user] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    const map = new Map<string, SlackUser>();
    for (const [id, user] of results) {
      if (user) map.set(id, user);
    }
    return map;
  }
}

// ── Slack types ──────────────────────────────────────────────────────────────

interface SlackResponse {
  ok: boolean;
  error?: string;
}

export interface SlackChannel {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_channel?: boolean;
  is_group?: boolean;
  user?: string; // DM partner user ID (for is_im channels)
  topic?: { value: string };
  purpose?: { value: string };
  updated?: number;
  latest?: SlackMessage;
}

export interface SlackMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  subtype?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile: {
    display_name?: string;
    real_name?: string;
    image_48?: string;
    image_72?: string;
  };
  is_bot?: boolean;
}
