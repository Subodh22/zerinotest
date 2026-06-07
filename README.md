# zerniotest

A Kinso-style **unified inbox** that merges multiple sources into one view:
- **Zernio** — social DMs across platforms (Instagram, Messenger, X, Telegram, …).
- **Gmail** — email threads via the Gmail API.
- **Outlook** — email threads via Microsoft Graph.
- **Slack** — channels and DMs.

Read threads across every source, open them, and reply — all in one web app.

## Sources & architecture

Each extra source is wired into the `/api/*` routes by an id prefix
(`gmail:`, `outlook:`, `slack:`) so a thread read or reply routes to the right
backend. Each has a small env-configured client that returns `null` when not set
up, so the inbox simply shows whatever is configured:

- `src/zernio.ts` — social DMs (the base source).
- `src/gmail.ts` + `lib/gmail-server.ts` — Gmail over the Gmail API.
- `src/outlook.ts` + `lib/outlook-server.ts` — Outlook mail over Microsoft Graph.
- `src/slack.ts` + `lib/slack-server.ts` — Slack.

All of these read credentials from env vars (no runtime filesystem writes), so
they work on Vercel. OAuth sources (Gmail, Outlook) get their refresh token once
via a bootstrap route that prints it to paste into the environment.

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

### Connecting Outlook (optional)

Outlook mail uses Microsoft Graph, which needs an Azure AD app registration:

1. At [portal.azure.com](https://portal.azure.com) → **Azure AD → App registrations → New registration**.
2. Add **Web** redirect URIs: `http://localhost:3000/api/auth/outlook/callback`
   and your deployed `https://<your-app>.vercel.app/api/auth/outlook/callback`.
3. Under **API permissions** add delegated Graph scopes: `offline_access`,
   `User.Read`, `Mail.Read`, `Mail.Send`.
4. Under **Certificates & secrets**, create a client secret.
5. Put `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` in `.env` (see `.env.example`).
6. Get a refresh token **once**: run the app, visit
   [/api/auth/outlook](http://localhost:3000/api/auth/outlook), sign in, and copy
   the printed token into `MS_REFRESH_TOKEN` (locally and in your Vercel env vars).
   This mirrors how Gmail's `GOOGLE_REFRESH_TOKEN` is obtained — nothing is written
   to the filesystem, so it works on Vercel. Outlook then appears in the inbox
   automatically, just like Gmail and Slack.

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
