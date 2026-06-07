# zerniotest

A Kinso-style **unified inbox** built on the [Zernio API](https://docs.zernio.com):
read social DMs across platforms in one web app, open threads, and reply.

## The web app

```bash
npm run dev       # then open http://localhost:3000
```

A Next.js app with a two-pane inbox (conversation list + thread view), account
pills, analytics, and a reply composer. Your `sk_` API key stays **server-side** —
the browser talks to `/api/*` routes, which proxy to Zernio. Key files:

- `app/page.tsx` — the inbox UI.
- `app/api/*` — server routes (accounts, conversations, messages, analytics).
- `lib/zernio-server.ts` — builds the server-side client; the key never reaches the browser.

## CLI tools

- `src/zernio.ts` — tiny, dependency-free Zernio API client (Node 18+ global `fetch`),
  shared by the web app and the scripts.
- `src/explore.ts` — **read-only** account explorer. Hits your live account and prints
  what's connected, your conversations, a sample thread, and analytics. It never sends
  a DM or posts anything.
- `src/check-ig.ts` — quick Instagram-DM access probe (`npm run check:ig`).

## Setup

1. Get your API key from the Zernio dashboard → **Settings → API Keys** (format `sk_...`).
2. Copy the example env file and paste your key:
   ```bash
   cp .env.example .env
   # then edit .env and set ZERNIO_API_KEY=sk_...
   ```
   `.env` is gitignored, so the key stays out of version control.
3. Install deps (already done if you ran `npm install`):
   ```bash
   npm install
   ```

## Run the explorer

```bash
npm run explore
```

You'll see, for your account:
- connected social accounts,
- unified inbox conversations (DMs),
- a sample message thread,
- post analytics,
- a summary of which capabilities are available to your plan.

## API quick reference (base URL `https://zernio.com/api/v1`, `Authorization: Bearer sk_...`)

| Purpose | Endpoint |
|---|---|
| List connected accounts | `GET /accounts` |
| List conversations (DMs) | `GET /inbox/conversations` |
| Read a thread | `GET /inbox/messages/{conversationId}` |
| Send a DM reply | `POST /inbox/send/{conversationId}` |
| Post comments | `GET /inbox/post-comments/{postId}` |
| Reply to a comment | `POST /inbox/reply/{postId}` |
| Register a webhook | `POST /webhooks/create-webhook-settings` |
| Post analytics | `GET /analytics/posts` |

Webhook events for real-time inbox: `message.received`, `comment.received`,
`conversation.started`, `message.read`, `message.delivered`.
