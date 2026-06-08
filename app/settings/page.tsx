"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";

interface ConnectedAccount {
  id: number;
  provider: string;
  label: string | null;
}

const PROVIDERS = [
  {
    id: "gmail",
    name: "Gmail",
    emoji: "📧",
    description: "Read and reply to Gmail threads",
    connectUrl: "/api/auth/google",
    needsEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    id: "outlook",
    name: "Outlook",
    emoji: "✉️",
    description: "Read and reply to Outlook emails",
    connectUrl: "/api/auth/outlook",
    needsEnv: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"],
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💬",
    description: "Slack channels and DMs",
    connectUrl: null, // Slack uses bot tokens — needs a different flow
    needsEnv: [],
  },
];

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAccounts() {
    try {
      const res = await fetch("/api/auth/connected-accounts");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? You can reconnect it later.`)) return;
    await fetch("/api/auth/connected-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    loadAccounts();
  }

  const connected = new Map(accounts.map((a) => [a.provider, a]));

  return (
    <div className="min-h-full bg-neutral-50">
      <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm font-medium text-brand-600 hover:underline">
            &larr; Back to Inbox
          </a>
          <span className="text-neutral-300">|</span>
          <h1 className="text-sm font-semibold">Settings</h1>
        </div>
        <UserButton />
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h2 className="text-lg font-semibold text-neutral-900">Connected Accounts</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Connect your email and messaging accounts. Your social media (Instagram, Twitter, etc.)
          is managed through Zernio and is already connected.
        </p>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-200" />
              ))}
            </div>
          ) : (
            PROVIDERS.map((p) => {
              const acct = connected.get(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-xl">
                    {p.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-neutral-900">{p.name}</div>
                    {acct ? (
                      <div className="text-xs text-green-600">
                        Connected{acct.label ? ` — ${acct.label}` : ""}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400">{p.description}</div>
                    )}
                  </div>
                  {acct ? (
                    <button
                      onClick={() => disconnect(p.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Disconnect
                    </button>
                  ) : p.connectUrl ? (
                    <a
                      href={p.connectUrl}
                      className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Connect
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-400">Contact admin</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-10 rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Social Media (Zernio)</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Instagram, Facebook, Twitter, Telegram, Reddit, and Bluesky conversations are handled
            through the Zernio API and are available automatically in your inbox.
          </p>
        </div>
      </div>
    </div>
  );
}
