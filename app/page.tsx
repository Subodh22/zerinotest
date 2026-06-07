"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Account,
  AnalyticsOverview,
  Conversation,
  ConversationsMeta,
  Message,
} from "@/lib/types";

// ── Platform presentation ───────────────────────────────────────────────────
const PLATFORM: Record<string, { emoji: string; label: string; dot: string }> = {
  instagram: { emoji: "📸", label: "Instagram", dot: "bg-pink-500" },
  facebook: { emoji: "💬", label: "Messenger", dot: "bg-blue-600" },
  twitter: { emoji: "🐦", label: "X / Twitter", dot: "bg-neutral-800" },
  telegram: { emoji: "✈️", label: "Telegram", dot: "bg-sky-500" },
  reddit: { emoji: "👽", label: "Reddit", dot: "bg-orange-500" },
  bluesky: { emoji: "🦋", label: "Bluesky", dot: "bg-sky-400" },
  whatsapp: { emoji: "🟢", label: "WhatsApp", dot: "bg-green-500" },
  linkedin: { emoji: "💼", label: "LinkedIn", dot: "bg-blue-700" },
  google: { emoji: "📧", label: "Gmail", dot: "bg-red-500" },
  slack: { emoji: "💬", label: "Slack", dot: "bg-purple-600" },
};
const platform = (p?: string) =>
  PLATFORM[p ?? ""] ?? { emoji: "💠", label: p ?? "Unknown", dot: "bg-neutral-400" };

// ── Time helpers ──────────────────────────────────────────────────────────────
function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function clockTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [meta, setMeta] = useState<ConversationsMeta | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations (reused for initial load + polling).
  const refreshConversations = useRef(async () => {
    try {
      const conv = await getJSON<{ data: Conversation[]; meta: ConversationsMeta | null }>(
        "/api/conversations",
      );
      setConversations(conv.data ?? []);
      setMeta(conv.meta ?? null);
      setListError(null);
    } catch (e) {
      setListError((e as Error).message);
    }
  });

  // Initial load: accounts + conversations + analytics in parallel.
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const [acc] = await Promise.all([
          getJSON<{ accounts: Account[] }>("/api/accounts"),
          refreshConversations.current(),
        ]);
        setAccounts(acc.accounts ?? []);
      } catch (e) {
        setListError((e as Error).message);
      } finally {
        setLoadingList(false);
      }
      // Analytics is non-critical; load it separately so a failure doesn't block the inbox.
      try {
        const a = await getJSON<{ overview: AnalyticsOverview | null }>("/api/analytics");
        setOverview(a.overview);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Poll conversation list every 10 seconds for new incoming messages.
  useEffect(() => {
    const id = setInterval(() => refreshConversations.current(), 10_000);
    return () => clearInterval(id);
  }, []);

  // Fetch messages for a conversation (reused for load + polling).
  const fetchMessages = async (c: Conversation) => {
    const res = await getJSON<{ data: Message[] }>(
      `/api/messages/${encodeURIComponent(c.id)}?accountId=${encodeURIComponent(c.accountId)}`,
    );
    return res.data ?? [];
  };

  // Load a thread when a conversation is selected.
  async function openConversation(c: Conversation) {
    setSelected(c);
    setMessages([]);
    setDraft("");
    setLoadingThread(true);
    try {
      setMessages(await fetchMessages(c));
    } catch (e) {
      setMessages([]);
      setListError((e as Error).message);
    } finally {
      setLoadingThread(false);
    }
  }

  // Poll the active thread every 5 seconds for new incoming messages.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (!selected) return;
    const id = setInterval(async () => {
      const cur = selectedRef.current;
      if (!cur) return;
      try {
        setMessages(await fetchMessages(cur));
      } catch {
        /* swallow polling errors silently */
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [selected]);

  async function sendReply() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/messages/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selected.accountId, message: draft.trim() }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Send failed");
      });
      setDraft("");
      await openConversation(selected); // refresh thread
    } catch (e) {
      alert("Couldn't send: " + (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.participantName ?? "").toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q) ||
        (c.platform ?? "").toLowerCase().includes(q),
    );
  }, [conversations, filter]);

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            ✦
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Kinso Clone</div>
            <div className="text-xs text-neutral-400">Unified inbox · Zernio</div>
          </div>
        </div>

        <div className="ml-2 flex items-center gap-1.5">
          {accounts.map((a) => {
            const p = platform(a.platform);
            return (
              <span
                key={a._id ?? a.id ?? a.accountId}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700"
                title={`${p.label} · ${a.displayName ?? a.name ?? ""}`}
              >
                <span>{p.emoji}</span>
                <span className="max-w-[120px] truncate">{a.displayName ?? a.name ?? p.label}</span>
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {overview && (
            <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700">
              {overview.publishedPosts ?? overview.totalPosts ?? 0} posts published
            </span>
          )}
          {totalUnread > 0 && (
            <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-600">
              {totalUnread} unread
            </span>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[380px] shrink-0 flex-col border-r border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">Inbox</h2>
              <span className="text-xs text-neutral-400">{filtered.length} conversations</span>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {/* Failed-account warning (e.g. Instagram permission/timeout) */}
          {meta?.failedAccounts && meta.failedAccounts.length > 0 && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
              {meta.failedAccounts.map((f, i) => (
                <div key={i}>
                  ⚠ {platform(f.platform).label}: {f.error}
                </div>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <ListSkeleton />
            ) : listError ? (
              <div className="p-6 text-sm text-rose-600">{listError}</div>
            ) : filtered.length === 0 ? (
              <EmptyList hasAny={conversations.length > 0} />
            ) : (
              filtered.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  active={selected?.id === c.id}
                  onClick={() => openConversation(c)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <main className="flex min-w-0 flex-1 flex-col bg-neutral-100">
          {!selected ? (
            <NoSelection />
          ) : (
            <>
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-6">
                <Avatar conv={selected} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {selected.participantName || "Unknown contact"}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {platform(selected.platform).label}
                    {selected.accountUsername ? ` · @${selected.accountUsername}` : ""}
                  </div>
                </div>
                {selected.url && (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Open on platform ↗
                  </a>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {loadingThread ? (
                  <ThreadSkeleton />
                ) : messages.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-neutral-400">
                    No messages in this conversation yet.
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-2xl flex-col gap-3">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} m={m} />
                    ))}
                    <div ref={threadEndRef} />
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-neutral-200 bg-white px-6 py-4">
                <div className="mx-auto flex max-w-2xl items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
                    }}
                    rows={1}
                    placeholder={`Reply to ${selected.participantName || "contact"}…  (⌘↵ to send)`}
                    className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !draft.trim()}
                    className="h-[44px] shrink-0 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function Avatar({ conv }: { conv: Conversation }) {
  const p = platform(conv.platform);
  const initial = (conv.participantName || "?").charAt(0).toUpperCase();
  return (
    <div className="relative">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-50 text-sm font-semibold text-brand-700">
        {initial}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ${p.dot} text-[8px] ring-2 ring-white`}
        title={p.label}
      >
        {p.emoji}
      </span>
    </div>
  );
}

function ConversationRow({
  c,
  active,
  onClick,
}: {
  c: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3 text-left transition ${
        active ? "bg-brand-50" : "hover:bg-neutral-50"
      }`}
    >
      <Avatar conv={c} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-neutral-900">
            {c.participantName || "Unknown contact"}
          </span>
          <span className="shrink-0 text-xs text-neutral-400">{relativeTime(c.updatedTime)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-neutral-500">
            {c.lastMessage || "No preview"}
          </span>
          {c.unreadCount ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
              {c.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const outgoing = m.direction === "outgoing";
  const hasText = !!m.message?.trim();
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
          outgoing
            ? "rounded-br-md bg-brand-600 text-white"
            : "rounded-bl-md bg-white text-neutral-800"
        }`}
      >
        {hasText && <div className="whitespace-pre-wrap break-words">{m.message}</div>}
        {m.attachments?.map((a, i) => (
          <div key={i} className={`${hasText ? "mt-2 " : ""}`}>
            {a.type === "image" && a.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.previewUrl || a.url} alt="" className="max-h-56 rounded-lg" />
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  outgoing ? "bg-white/20" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                📎 {a.filename || a.type}
              </span>
            )}
          </div>
        ))}
        <div
          className={`mt-1 text-right text-[10px] ${outgoing ? "text-white/70" : "text-neutral-400"}`}
        >
          {clockTime(m.createdAt)}
          {outgoing && m.deliveryStatus ? ` · ${m.deliveryStatus}` : ""}
        </div>
      </div>
    </div>
  );
}

function NoSelection() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
          ✦
        </div>
        <h3 className="text-lg font-semibold text-neutral-800">Your unified inbox</h3>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">
          Pick a conversation on the left to read the thread and reply — across every connected
          platform, in one place.
        </p>
      </div>
    </div>
  );
}

function EmptyList({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="p-6 text-center text-sm text-neutral-400">
      {hasAny ? "No conversations match your search." : "No conversations yet."}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-200" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
          <div
            className={`h-10 animate-pulse rounded-2xl bg-neutral-200 ${i % 2 ? "w-40" : "w-56"}`}
          />
        </div>
      ))}
    </div>
  );
}
