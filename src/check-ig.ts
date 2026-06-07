/**
 * Instagram DM access checker.
 *
 * After you change an Instagram/Meta setting, run `npm run check:ig` to see
 * immediately whether Zernio can now read your Instagram conversations.
 * Read-only — never sends anything.
 */

import { ZernioClient } from "./zernio.ts";

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on environment */
}

const z = new ZernioClient(process.env.ZERNIO_API_KEY!);

const res = (await z.listConversations({ platform: "instagram", limit: 25 })) as {
  data?: unknown[];
  meta?: {
    accountsQueried?: number;
    accountsFailed?: number;
    failedAccounts?: { platform?: string; accountUsername?: string; error?: string; code?: string }[];
  };
};

const failed = res?.meta?.failedAccounts ?? [];
const count = res?.data?.length ?? 0;

if (failed.length === 0) {
  console.log(`\x1b[32m✓ Instagram DM access is working — ${count} conversation(s) returned.\x1b[0m`);
  if (count === 0) {
    console.log("\x1b[2m  (No conversations yet — send your IG account a test DM from another account.)\x1b[0m");
  }
} else {
  console.log(`\x1b[31m✗ Instagram still blocked.\x1b[0m`);
  for (const f of failed) {
    console.log(`  ${f.platform} ${f.accountUsername ?? ""}: ${f.error}${f.code ? ` [${f.code}]` : ""}`);
  }
  console.log("\x1b[2m  See docs/instagram-dm-setup.md for the fix checklist.\x1b[0m");
}
