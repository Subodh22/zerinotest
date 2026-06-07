# Enabling Instagram DM access through Zernio

Your Zernio API works — but `GET /v1/inbox/conversations` reports
`instagram: Request timeout`. That means the Instagram side isn't granting DM
access. Work through this checklist **in order**, then run `npm run check:ig`
after each change to see when it clears.

## The 4 requirements (all must be true)

1. **Professional account.** Your Instagram account must be a **Business** or
   **Creator** account — not personal.
   - Instagram app → *Settings and privacy* → *Account type and tools* →
     *Switch to professional account*.

2. **Linked to a Facebook Page.** Instagram's messaging API only works when the
   IG account is connected to a Facebook Page you control.
   - Instagram app → *Settings* → *Accounts Center* → link the Facebook Page,
     or do it from the Facebook Page → *Settings* → *Linked accounts*.

3. **"Allow Access to Messages" turned ON.** ← most common cause of a silent
   timeout. This toggle lets third-party tools (Zernio) read/send your DMs.
   - Instagram profile → *Settings* → *Privacy* → *Messages* →
     under **Connected Tools**, enable **"Allow Access to Messages"**.
   - If this is OFF, DMs can only be seen inside the Instagram app, and API
     reads hang/time out exactly like you're seeing.

4. **Reconnect in Zernio with the messaging permission.** Even with 1–3 done,
   the existing connection may have been authorized *without* the messaging
   scope. Disconnect and reconnect the Instagram account in the Zernio
   dashboard, and make sure you **accept the messaging permission**
   (`instagram_business_manage_messages`) on Meta's consent screen.

## After it connects

- **Reading DMs** works for existing conversations once 1–4 are done.
- **Sending DMs** is limited by Instagram's **24-hour window**: you can only
  message a user who messaged you within the last 24 hours (outside that you
  need an approved message tag; Instagram only supports `HUMAN_AGENT`).
- **Scale / other people's accounts:** using this with accounts beyond your own
  test users requires **Meta App Review** for the messaging permission. For
  building and testing against *your own* account you're fine without it.

## Verify

```bash
npm run check:ig     # re-tests just the Instagram inbox
npm run explore      # full account capability sweep
```

When `check:ig` prints `✓ Instagram DM access is working`, send your IG account
a test DM from another account and run it again to see the conversation appear.
