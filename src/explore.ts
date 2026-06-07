/**
 * Zernio account explorer (READ-ONLY).
 *
 * Hits your live Zernio account and prints what's connected and what data
 * flows back, so you can see exactly what's available before building on it.
 * It only makes GET requests — it never sends a DM or posts anything.
 *
 * Run:  npm run explore      (reads ZERNIO_API_KEY from .env or the environment)
 */

import { ZernioClient, ZernioError, coerceArray } from "./zernio.ts";

// Node 22 has a built-in .env loader. Load it if a .env file exists.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file — rely on the environment */
}

const KEY = process.env.ZERNIO_API_KEY;
const BASE_URL = process.env.ZERNIO_BASE_URL;

// ---- tiny terminal helpers ----
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const rule = () => console.log(dim("─".repeat(64)));
function header(title: string) {
  console.log("");
  console.log(bold(title));
  rule();
}

function preview(value: unknown, max = 400): string {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length > max ? s.slice(0, max) + dim(" …(truncated)") : s;
}

/** Run one labeled probe; report success/failure without crashing the whole run. */
async function probe(label: string, fn: () => Promise<void>): Promise<"ok" | "fail"> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    if (err instanceof ZernioError) {
      const hint =
        err.status === 401
          ? "Invalid or missing API key."
          : err.status === 403
            ? "Authenticated, but your plan lacks this (e.g. Inbox addon required)."
            : err.status === 404
              ? "Endpoint not found — path may differ."
              : err.status === 429
                ? "Rate limited — wait and retry."
                : "";
      console.log(red(`  ✗ ${label} failed: ${err.message}`));
      if (hint) console.log(yellow(`    → ${hint}`));
      if (err.body) console.log(dim("    body: " + preview(err.body, 200)));
    } else {
      console.log(red(`  ✗ ${label} failed: ${(err as Error).message}`));
    }
    return "fail";
  }
}

type Conv = {
  id?: string;
  platform?: string;
  accountId?: string;
  participantName?: string;
  lastMessage?: string;
  unreadCount?: number | null;
};

async function main() {
  console.log(bold("\n🔎 Zernio account explorer") + dim("  (read-only)"));

  if (!KEY) {
    console.log(red("\nNo ZERNIO_API_KEY found."));
    console.log("Set it, then re-run `npm run explore`:");
    console.log(dim("  1) copy .env.example to .env and paste your key, or"));
    console.log(dim("  2) ZERNIO_API_KEY=sk_... npm run explore"));
    process.exit(1);
  }

  const z = new ZernioClient(KEY, BASE_URL || undefined);
  const capability: Record<string, "ok" | "fail"> = {};

  // 1) Connected accounts — the foundation for everything else.
  header("1. Connected accounts  (GET /accounts)");
  capability.accounts = await probe("accounts", async () => {
    const accounts = coerceArray(await z.listAccounts()) as Record<string, unknown>[];
    if (accounts.length === 0) {
      console.log(yellow("  No accounts connected yet. Connect one in the Zernio dashboard."));
      return;
    }
    console.log(green(`  ${accounts.length} account(s) connected:`));
    for (const a of accounts) {
      const id = (a._id ?? a.id ?? a.accountId) as string | undefined;
      const name = a.displayName ?? a.name ?? a.handle ?? "";
      console.log(`    • ${bold(String(a.platform ?? "?"))}  ${name}  ${dim(String(id ?? ""))}`);
    }
  });

  // 2) Unified inbox — the core of a Kinso-style app.
  header("2. Unified inbox  (GET /inbox/conversations)");
  let firstConv: Conv | undefined;
  capability.inbox = await probe("inbox", async () => {
    const res = (await z.listConversations({ limit: 25 })) as {
      data?: Conv[];
      meta?: { accountsQueried?: number; accountsFailed?: number; failedAccounts?: unknown[] };
    };
    const convos = (res?.data ?? (coerceArray(res) as Conv[])) ?? [];
    firstConv = convos[0];

    // The meta block tells us WHY the inbox might be empty.
    const meta = res?.meta;
    if (meta) {
      console.log(
        dim(`  accounts queried: ${meta.accountsQueried ?? "?"}, failed: ${meta.accountsFailed ?? 0}`),
      );
      if (meta.failedAccounts?.length) {
        console.log(yellow("  Some accounts couldn't be queried:"));
        for (const f of meta.failedAccounts as Record<string, unknown>[]) {
          console.log(yellow(`    • ${f.platform ?? "?"} ${f.accountUsername ?? ""}: ${f.error ?? ""}`));
        }
      }
    }

    console.log(green(`  ${convos.length} conversation(s) returned.`));
    convos.slice(0, 5).forEach((c) => {
      const unread = c.unreadCount ? red(` (${c.unreadCount} unread)`) : "";
      console.log(
        `    • ${bold(String(c.platform ?? "?"))}  ${c.participantName ?? "?"}${unread}  ${dim(preview(c.lastMessage ?? "", 50))}`,
      );
    });
    if (convos.length === 0) {
      console.log(
        dim("  (Empty is normal if there are no DMs yet, or the platform needs DM permissions.)"),
      );
    }
  });

  // 3) Read a thread — confirms we can pull message history for AI context.
  header("3. Read a thread  (GET /inbox/conversations/{id}/messages)");
  if (firstConv?.id && firstConv.accountId) {
    capability.messages = await probe("messages", async () => {
      const msgs = coerceArray(
        await z.listMessages(firstConv!.id!, { accountId: firstConv!.accountId!, limit: 10, sortOrder: "desc" }),
      ) as Record<string, unknown>[];
      console.log(green(`  ${msgs.length} message(s) in the latest thread.`));
      msgs.slice(0, 6).forEach((m) => {
        const who = m.from ?? m.sender ?? m.senderName ?? m.direction ?? "?";
        const text = m.text ?? m.message ?? m.body ?? "";
        console.log(`    ${dim(String(who) + ":")} ${preview(text, 70)}`);
      });
    });
  } else {
    console.log(dim("  Skipped — no conversation available to read (inbox empty)."));
  }

  // 4) Analytics — the "data" side.
  header("4. Post analytics  (GET /analytics)");
  capability.analytics = await probe("analytics", async () => {
    const data = (await z.getAnalytics({ limit: 10 })) as {
      overview?: Record<string, unknown>;
      data?: unknown[];
      posts?: unknown[];
    };
    const overview = data?.overview;
    if (overview) {
      console.log(green("  overview:"));
      console.log("  " + preview(overview, 300).replace(/\n/g, "\n  "));
    } else {
      console.log(green("  analytics endpoint reachable."));
      console.log(dim("  " + preview(data, 300).replace(/\n/g, "\n  ")));
    }
  });

  // ---- summary ----
  header("Summary — what your account can do right now");
  const mark = (s: "ok" | "fail" | undefined) =>
    s === "ok" ? green("✓ available") : s === "fail" ? red("✗ unavailable") : dim("– skipped");
  console.log(`  Connected accounts ......... ${mark(capability.accounts)}`);
  console.log(`  Unified inbox (DMs) ........ ${mark(capability.inbox)}`);
  console.log(`  Read message threads ....... ${mark(capability.messages)}`);
  console.log(`  Post analytics ............. ${mark(capability.analytics)}`);
  console.log("");
  console.log(dim("  Next: Kinso clone = this data + Claude to prioritize threads and draft replies."));
  console.log("");
}

main().catch((e) => {
  console.error(red("\nUnexpected error:"), e);
  process.exit(1);
});
