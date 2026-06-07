"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Account,
  AnalyticsOverview,
  Comment,
  Conversation,
  ConversationsMeta,
  Message,
  Post,
} from "@/lib/types";

// ── Platform presentation ────────────────────────────────────────────────────
const PLATFORM: Record<string, { emoji: string; label: string; dot: string }> = {
  instagram: { emoji: "📸", label: "Instagram", dot: "bg-pink-500" },
  facebook: { emoji: "💬", label: "Messenger", dot: "bg-blue-600" },
  twitter: { emoji: "🐦", label: "X / Twitter", dot: "bg-neutral-800" },
  telegram: { emoji: "✈️", label: "Telegram", dot: "bg-sky-500" },
  reddit: { emoji: "👽", label: "Reddit", dot: "bg-orange-500" },
  bluesky: { emoji: "🦋", label: "Bluesky", dot: "bg-sky-400" },
  whatsapp: { emoji: "🟢", label: "WhatsApp", dot: "bg-green-500" },
  linkedin: { emoji: "💼", label: "LinkedIn", dot: "bg-blue-700" },
  outlook: { emoji: "✉️", label: "Outlook", dot: "bg-blue-500" },
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

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

// ── Post / comment field normalizers ─────────────────────────────────────────
const getPostId = (p: Post) => (p.postId ?? p.id ?? p._id ?? "") as string;
const getPostCaption = (p: Post) => p.caption ?? p.content ?? p.message ?? "";
const getPostTime = (p: Post) => p.publishedAt ?? p.createdAt;
const getCommentId = (c: Comment) => (c._id ?? c.id ?? "") as string;
const getCommentText = (c: Comment) => c.message ?? c.text ?? c.body ?? "";
const getCommentSender = (c: Comment) => c.senderName ?? c.from ?? c.username ?? "";

type Tab = "inbox" | "posts";

export default function Home() {
  const [tab, setTab] = useState<Tab>("inbox");

  // ── Inbox state ──────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [meta, setMeta] = useState<ConversationsMeta | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [inboxDraft, setInboxDraft] = useState("");
  const [sendingDm, setSendingDm] = useState(false);
  const [filter, setFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  // ── Posts / comments state ────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [postFilter, setPostFilter] = useState("");

  const threadEndRef = useRef<HTMLDivElement>(null);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Stable ref so polling effects can call the latest version without re-registering.
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
      try {
        const a = await getJSON<{ overview: AnalyticsOverview | null }>("/api/analytics");
        setOverview(a.overview);
      } catch {
        /* non-critical */
      }
    })();
  }, []);

  // Poll conversation list every 10 seconds for new incoming messages.
  useEffect(() => {
    const id = setInterval(() => refreshConversations.current(), 10_000);
    return () => clearInterval(id);
  }, []);

  // Lazy-load posts the first time the Posts tab is opened.
  useEffect(() => {
    if (tab !== "posts" || posts.length > 0) return;
    (async () => {
      setLoadingPosts(true);
      setPostsError(null);
      try {
        const res = await getJSON<{ data: Post[] }>("/api/posts");
        setPosts(res.data ?? []);
      } catch (e) {
        setPostsError((e as Error).message);
      } finally {
        setLoadingPosts(false);
      }
    })();
  }, [tab, posts.length]);

  // Fetch messages for a conversation (reused for initial load + polling).
  const fetchMessages = async (c: Conversation) => {
    const res = await getJSON<{ data: Message[] }>(
      `/api/messages/${encodeURIComponent(c.id)}?accountId=${encodeURIComponent(c.accountId)}`,
    );
    return res.data ?? [];
  };

  // Open a DM conversation and load its messages.
  async function openConversation(c: Conversation) {
    setSelected(c);
    setMessages([]);
    setInboxDraft("");
    setLoadingThread(true);
    try {
      setMessages(await fetchMessages(c));
    } catch (e) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Fetch comments for a post (reused for initial load + polling).
  const fetchComments = async (p: Post) => {
    const pid = getPostId(p);
    const aid = p.accountId;
    if (!pid || !aid) return [];
    const res = await getJSON<{ data: Comment[] }>(
      `/api/comments/${encodeURIComponent(pid)}?accountId=${encodeURIComponent(aid)}`,
    );
    return res.data ?? [];
  };

  // Open a post and load its comments.
  async function openPost(p: Post) {
    setSelectedPost(p);
    setComments([]);
    setCommentDraft("");
    setReplyingTo(null);
    const pid = getPostId(p);
    const aid = p.accountId;
    if (!pid || !aid) return;
    setLoadingComments(true);
    try {
      setComments(await fetchComments(p));
    } catch (e) {
      setPostsError((e as Error).message);
    } finally {
      setLoadingComments(false);
    }
  }

  // Poll the active post's comments every 5 seconds for new comments.
  const selectedPostRef = useRef(selectedPost);
  selectedPostRef.current = selectedPost;
  useEffect(() => {
    if (!selectedPost) return;
    const id = setInterval(async () => {
      const cur = selectedPostRef.current;
      if (!cur) return;
      try {
        setComments(await fetchComments(cur));
      } catch {
        /* swallow polling errors silently */
      }
    }, 5_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPost ? getPostId(selectedPost) : null]);

  async function sendDmReply() {
    if (!selected || !inboxDraft.trim()) return;
    setSendingDm(true);
    try {
      const r = await fetch(`/api/messages/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selected.accountId, message: inboxDraft.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Send failed");
      setInboxDraft("");
      await openConversation(selected);
    } catch (e) {
      alert("Couldn't send: " + (e as Error).message);
    } finally {
      setSendingDm(false);
    }
  }

  async function sendCommentReply() {
    if (!selectedPost || !commentDraft.trim()) return;
    const pid = getPostId(selectedPost);
    const aid = selectedPost.accountId;
    if (!pid || !aid) return;
    setSendingComment(true);
    try {
      const commentId = replyingTo ? getCommentId(replyingTo) : undefined;
      const r = await fetch(`/api/comments/${encodeURIComponent(pid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: aid, message: commentDraft.trim(), commentId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Send failed");
      setCommentDraft("");
      setReplyingTo(null);
      await openPost(selectedPost);
    } catch (e) {
      alert("Couldn't send: " + (e as Error).message);
    } finally {
      setSendingComment(false);
    }
  }

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const filtered = useMemo(() => {
    let result = conversations;
    if (platformFilter) {
      result = result.filter((c) => c.platform === platformFilter);
    }
    const q = filter.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          (c.participantName ?? "").toLowerCase().includes(q) ||
          (c.lastMessage ?? "").toLowerCase().includes(q) ||
          (c.platform ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [conversations, filter, platformFilter]);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      if (c.platform) set.add(c.platform);
    }
    return Array.from(set).sort();
  }, [conversations]);

  const filteredPosts = useMemo(() => {
    const q = postFilter.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        getPostCaption(p).toLowerCase().includes(q) ||
        (p.platform ?? "").toLowerCase().includes(q),
    );
  }, [posts, postFilter]);

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0);

  return (
    <div className="flex h-full">
      {/* ── Dark sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex w-[340px] shrink-0 flex-col bg-sidebar">
        {/* Logo area */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg text-white shadow-lg shadow-brand-500/25">
            ✦
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Kinso</div>
            <div className="text-[11px] text-sidebar-muted">Unified Inbox</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {totalUnread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {totalUnread}
              </span>
            )}
          </div>
        </div>

        {/* Connected accounts strip */}
        {accounts.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-sidebar-border px-4 py-2.5">
            {accounts.map((a) => {
              const p = platform(a.platform);
              return (
                <span
                  key={a._id ?? a.id ?? a.accountId}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-0.5 text-[11px] text-slate-300"
                  title={`${p.label} · ${a.displayName ?? a.name ?? ""}`}
                >
                  <span className="text-xs">{p.emoji}</span>
                  <span className="max-w-[80px] truncate">{a.displayName ?? a.name ?? p.label}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Tab toggle */}
        <div className="px-3 pt-3">
          <div className="flex rounded-lg bg-white/[0.06] p-0.5">
            <button
              onClick={() => setTab("inbox")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                tab === "inbox"
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-sidebar-muted hover:text-slate-300"
              }`}
            >
              Inbox
              {totalUnread > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("posts")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                tab === "posts"
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-sidebar-muted hover:text-slate-300"
              }`}
            >
              Posts
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={tab === "inbox" ? filter : postFilter}
              onChange={(e) =>
                tab === "inbox" ? setFilter(e.target.value) : setPostFilter(e.target.value)
              }
              placeholder={tab === "inbox" ? "Search conversations…" : "Search posts…"}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] py-2 pl-8 pr-3 text-xs text-white outline-none placeholder:text-sidebar-muted focus:border-brand-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-brand-500/30"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-sidebar-muted">
              {tab === "inbox" ? filtered.length : filteredPosts.length}
            </span>
          </div>
        </div>

        {/* Platform filter pills — inbox only */}
        {tab === "inbox" && availablePlatforms.length > 1 && (
          <div className="flex flex-wrap gap-1 px-3 py-2">
            <button
              onClick={() => setPlatformFilter(null)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                platformFilter === null
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-sidebar-muted hover:bg-white/[0.08] hover:text-slate-300"
              }`}
            >
              All
            </button>
            {availablePlatforms.map((p) => {
              const info = platform(p);
              const active = platformFilter === p;
              return (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(active ? null : p)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-sidebar-muted hover:bg-white/[0.08] hover:text-slate-300"
                  }`}
                >
                  <span className="text-xs">{info.emoji}</span>
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Inbox list */}
        {tab === "inbox" && (
          <>
            {meta?.failedAccounts && meta.failedAccounts.length > 0 && (
              <div className="mx-3 mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                {meta.failedAccounts.map((f, i) => (
                  <div key={i}>
                    ⚠ {platform(f.platform).label}: {f.error}
                  </div>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingList ? (
                <DarkListSkeleton />
              ) : listError ? (
                <div className="p-6 text-sm text-rose-400">{listError}</div>
              ) : filtered.length === 0 ? (
                <DarkEmptyState hasAny={conversations.length > 0} noun="conversations" />
              ) : (
                <div className="px-2 py-1">
                  {filtered.map((c) => (
                    <ConversationRow
                      key={c.id}
                      c={c}
                      active={selected?.id === c.id}
                      onClick={() => openConversation(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Posts list */}
        {tab === "posts" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingPosts ? (
              <DarkListSkeleton />
            ) : postsError ? (
              <div className="p-6 text-sm text-rose-400">{postsError}</div>
            ) : filteredPosts.length === 0 ? (
              <DarkEmptyState hasAny={posts.length > 0} noun="posts" />
            ) : (
              <div className="px-2 py-1">
                {filteredPosts.map((p) => (
                  <PostRow
                    key={getPostId(p)}
                    p={p}
                    active={!!selectedPost && getPostId(selectedPost) === getPostId(p)}
                    onClick={() => openPost(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics footer */}
        {overview && (
          <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] text-sidebar-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {overview.publishedPosts ?? overview.totalPosts ?? 0} posts published
            </div>
          </div>
        )}
      </aside>

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col bg-gray-50">
        {tab === "inbox" ? (
          !selected ? (
            <NoSelection
              icon="✦"
              hint="Pick a conversation on the left to read the thread and reply — across every connected platform, in one place."
            />
          ) : (
            <>
              {/* Thread header */}
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <Avatar conv={selected} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {selected.subject || selected.participantName || "Unknown contact"}
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {platform(selected.platform).label}
                    {selected.subject && selected.participantName
                      ? ` · ${selected.participantName}`
                      : ""}
                    {selected.accountUsername ? ` · @${selected.accountUsername}` : ""}
                  </div>
                </div>
                {selected.url && (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 hover:shadow"
                  >
                    Open on platform ↗
                  </a>
                )}
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {loadingThread ? (
                  <ThreadSkeleton />
                ) : messages.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-gray-400">
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
              <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
                <div className="mx-auto flex max-w-2xl items-end gap-3">
                  <textarea
                    value={inboxDraft}
                    onChange={(e) => setInboxDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendDmReply();
                    }}
                    rows={1}
                    placeholder={`Reply to ${selected.participantName || "contact"}…  (⌘↵ to send)`}
                    className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:shadow-sm"
                  />
                  <button
                    onClick={sendDmReply}
                    disabled={sendingDm || !inboxDraft.trim()}
                    className="h-[44px] shrink-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition hover:shadow-lg hover:shadow-brand-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {sendingDm ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </>
          )
        ) : !selectedPost ? (
          <NoSelection
            icon="📝"
            hint="Pick a post on the left to see its comments and reply to them."
          />
        ) : (
          <>
            {/* Post header */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl">
                  {platform(selectedPost.platform).emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {platform(selectedPost.platform).label}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-gray-400">
                      {relativeTime(getPostTime(selectedPost))}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-gray-800">
                    {getPostCaption(selectedPost) || "No caption"}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    {(selectedPost.commentsCount ?? selectedPost.totalComments) !== undefined && (
                      <span>
                        💬 {selectedPost.commentsCount ?? selectedPost.totalComments} comments
                      </span>
                    )}
                    {selectedPost.likesCount !== undefined && (
                      <span>❤ {selectedPost.likesCount} likes</span>
                    )}
                    {(selectedPost.permalink ?? selectedPost.url) && (
                      <a
                        href={selectedPost.permalink ?? selectedPost.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto font-medium text-brand-600 hover:underline"
                      >
                        Open post ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Comments list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {loadingComments ? (
                <ThreadSkeleton />
              ) : comments.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-gray-400">
                  No comments yet.
                </div>
              ) : (
                <div className="mx-auto flex max-w-2xl flex-col gap-3">
                  {comments.map((c) => (
                    <CommentBubble
                      key={getCommentId(c)}
                      c={c}
                      onReply={() => setReplyingTo(c)}
                    />
                  ))}
                  <div ref={commentEndRef} />
                </div>
              )}
            </div>

            {/* Comment composer */}
            <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
              <div className="mx-auto max-w-2xl">
                {replyingTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-700">
                    <span>
                      Replying to{" "}
                      <strong>{getCommentSender(replyingTo) || "comment"}</strong>:{" "}
                      {getCommentText(replyingTo).slice(0, 60)}
                      {getCommentText(replyingTo).length > 60 ? "…" : ""}
                    </span>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="ml-auto shrink-0 text-brand-400 hover:text-brand-700"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendCommentReply();
                    }}
                    rows={1}
                    placeholder={
                      replyingTo
                        ? `Reply to ${getCommentSender(replyingTo) || "comment"}…  (⌘↵ to send)`
                        : "Add a comment…  (⌘↵ to send)"
                    }
                    className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:shadow-sm"
                  />
                  <button
                    onClick={sendCommentReply}
                    disabled={sendingComment || !commentDraft.trim()}
                    className="h-[44px] shrink-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition hover:shadow-lg hover:shadow-brand-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {sendingComment ? "Sending…" : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ conv }: { conv: Conversation }) {
  const p = platform(conv.platform);
  const initial = (conv.participantName || "?").charAt(0).toUpperCase();
  return (
    <div className="relative">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white shadow-sm">
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

function SidebarAvatar({ conv }: { conv: Conversation }) {
  const p = platform(conv.platform);
  const initial = (conv.participantName || "?").charAt(0).toUpperCase();
  return (
    <div className="relative">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white">
        {initial}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${p.dot} text-[7px] ring-[1.5px] ring-sidebar`}
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
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
        active
          ? "bg-white/[0.12]"
          : "hover:bg-white/[0.06]"
      }`}
    >
      <SidebarAvatar conv={c} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${c.unreadCount ? "font-semibold text-white" : "font-medium text-slate-300"}`}>
            {c.subject || c.participantName || "Unknown contact"}
          </span>
          <span className="shrink-0 text-[11px] text-sidebar-muted">{relativeTime(c.updatedTime)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-xs ${c.unreadCount ? "text-slate-400" : "text-sidebar-muted"}`}>
            {c.lastMessage || "No preview"}
          </span>
          {c.unreadCount ? (
            <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
              {c.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function PostRow({ p, active, onClick }: { p: Post; active: boolean; onClick: () => void }) {
  const pl = platform(p.platform);
  const caption = getPostCaption(p);
  const commentCount = p.commentsCount ?? p.totalComments;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
        active ? "bg-white/[0.12]" : "hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-lg">
        {pl.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-sidebar-muted">{pl.label}</span>
          <span className="shrink-0 text-[11px] text-sidebar-muted">{relativeTime(getPostTime(p))}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-300">{caption || "No caption"}</p>
        {commentCount !== undefined && (
          <span className="mt-0.5 block text-[11px] text-sidebar-muted">💬 {commentCount}</span>
        )}
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
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
          outgoing
            ? "rounded-br-md bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/20"
            : "rounded-bl-md bg-white text-gray-800 shadow-sm ring-1 ring-gray-100"
        }`}
      >
        {!outgoing && m.senderName && (
          <div className="mb-1 text-xs font-semibold text-brand-600">{m.senderName}</div>
        )}
        {hasText && <div className="whitespace-pre-wrap break-words">{m.message}</div>}
        {m.attachments?.map((a, i) => (
          <div key={i} className={hasText ? "mt-2" : ""}>
            {a.type === "image" && a.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.previewUrl || a.url} alt="" className="max-h-56 rounded-lg" />
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  outgoing ? "bg-white/20" : "bg-gray-100 text-gray-600"
                }`}
              >
                📎 {a.filename || a.type}
              </span>
            )}
          </div>
        ))}
        <div
          className={`mt-1 text-right text-[10px] ${outgoing ? "text-white/60" : "text-gray-400"}`}
        >
          {clockTime(m.createdAt)}
          {outgoing && m.deliveryStatus ? ` · ${m.deliveryStatus}` : ""}
        </div>
      </div>
    </div>
  );
}

function CommentBubble({ c, onReply }: { c: Comment; onReply: () => void }) {
  const outgoing = c.direction === "outgoing";
  const text = getCommentText(c);
  const sender = getCommentSender(c);
  return (
    <div className={`group flex flex-col gap-0.5 ${outgoing ? "items-end" : "items-start"}`}>
      {!outgoing && sender && (
        <span className="ml-1 text-xs font-semibold text-brand-600">{sender}</span>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
          outgoing
            ? "rounded-br-md bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/20"
            : "rounded-bl-md bg-white text-gray-800 shadow-sm ring-1 ring-gray-100"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{text || "—"}</div>
        <div
          className={`mt-1 text-right text-[10px] ${outgoing ? "text-white/60" : "text-gray-400"}`}
        >
          {clockTime(c.createdAt)}
        </div>
      </div>
      {!outgoing && (
        <button
          onClick={onReply}
          className="ml-1 text-xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-600"
        >
          ↩ Reply
        </button>
      )}
    </div>
  );
}

function NoSelection({ icon, hint }: { icon: string; hint: string }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 text-3xl shadow-lg shadow-brand-500/10">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-800">Your unified inbox</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-400">{hint}</p>
      </div>
    </div>
  );
}

function DarkEmptyState({ hasAny, noun }: { hasAny: boolean; noun: string }) {
  return (
    <div className="p-6 text-center text-xs text-sidebar-muted">
      {hasAny ? `No ${noun} match your search.` : `No ${noun} yet.`}
    </div>
  );
}

function DarkListSkeleton() {
  return (
    <div className="space-y-px px-2 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5">
          <div className="h-9 w-9 rounded-full skeleton-dark" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-2/3 rounded skeleton-dark" />
            <div className="h-2.5 w-1/2 rounded skeleton-dark" />
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
            className={`h-10 rounded-2xl skeleton ${i % 2 ? "w-40" : "w-56"}`}
          />
        </div>
      ))}
    </div>
  );
}
