# Relay

Social DM automation for HI Studio — a ManyChat-style platform for every network. Comment-to-DM, story replies, flows on a canvas, a shared Live Chat inbox, CRM, segmented broadcasts, analytics, and Claude-powered AI.

Connect every social account at once through **[Zernio](https://zernio.com)** (Instagram, Facebook, WhatsApp, TikTok, X, LinkedIn, YouTube, Threads, Bluesky, Reddit, SMS…), or connect Telegram, Instagram, Messenger and WhatsApp directly. No scraping. Sends are rate-limited.

Origin is the source of truth for this project.

## What it does

1. **Channels** — paste a Zernio API key (Relay registers its own signed webhook and routes every linked account), or a BotFather token / Meta token. Credentials are encrypted at rest (`ENCRYPTION_KEY`).
2. **Comment → DM** — keyword + post filters, random public replies or **AI-written public replies** to each comment, a private-reply opening DM, once per person per post, optional hide-after-reply. Story reply and story mention triggers. Account-wide **comment moderation** hides comments with blocked words or links before any automation runs.
3. **Flows** — a drag-and-drop canvas: Send Message (text, media, buttons, quick replies, typing), **Gallery** (swipeable product cards; native carousel on Instagram/Messenger, one message per card elsewhere), User input (with number, date and link reply types), Lead form, Tag, Set field, Subscribe, Condition, Smart Delay, A/B split, Start flow, HTTP request, Notify admin, **AI Step**, **Goal** (conversions + revenue), Stop, sticky **notes** for your team, plus undo/redo (⌘Z / ⇧⌘Z) and copy/paste of steps. Triggers: welcome, keywords, commands, growth links, comments, stories, **AI intent** (Claude matches what someone means, in any wording or language), default reply (every time or once per 24h). Fifteen starter **templates** (follow-to-unlock, product gallery, lead-scoring quiz, AI support router, appointment booking, Stripe checkout, AI qualifier…), an **in-browser simulator**, **version history** with one-click restore, JSON **export / import** to move flows between accounts, and per-node sent/click/conversion stats. `{{bot.key}}` bot fields hold shared values (prices, links) for every flow.
4. **AI (Claude)** — AI Step (chats toward a goal, collects fields, continues the flow or hands off), AI auto-reply from your knowledge base (paste it, or **import it from your website**) with a **playground** to chat with it before going live, Live Chat reply suggestions + summaries, "describe a flow, get a draft", and one-tap **AI rewrite** of any message (shorter, friendlier, more persuasive, emoji, grammar) in the brand voice.
5. **Live Chat** — three-pane inbox across every network: filters (open / needs reply / mine / unassigned / closed), team assignment with round-robin AI hand-offs, bulk select (mark done, assign), saved replies (`/`, with {{first_name}}-style variables), a **CSAT survey** when a chat is marked Done, **scheduled replies** (send later), **snooze** (until a time or their next message), collision alerts when a teammate is viewing or typing, tags, notes, automation pause/resume, AI copilot, two-way **AI translation**, the 24-hour messaging window, desktop notifications, an unread count in the tab title, and `j`/`k` keyboard navigation. A human reply or AI hand-off pauses the bot for that person.
6. **Contacts & CRM** — tags, custom fields, lists; segment filters with **saved segments** (reuse in Contacts and Broadcasts), bulk actions, CSV import/export, and a profile with lifetime value plus privacy tools (download a person's data, erase them), and **duplicate merge** for the same person on several networks (same email or phone).
7. **Broadcasts** — segments (tag, field, platform, list, last message within N hours, join date), send a message or a whole flow, schedule, **smart send time** (each person gets it at the hour they usually message, within 24h), **A/B tests** (two versions, 50/50 split, reply rate within 48h), **send a test** to yourself first, **AI drafting** (describe the goal, get versions A and B), **duplicate** a past send into a fresh draft, and an explicit confirm before anything queues.
8. **Growth** — trackable links (`/go/<slug>`), QR codes, attribution; Instagram ice breakers, Messenger menu, business hours with an away message.
9. **Analytics** — overview dashboard with an **AI weekly digest** (what happened, what to do next), a getting-started checklist, a Live Chat team report (replies, conversations, median first response and CSAT per teammate), per-flow runs / CTR / completion / conversions / revenue, AI conversation insights.
10. **Payments** — Stripe Payment Links in flows (`?client_reference_id={{contact_id}}`); a signed Stripe webhook turns each checkout into a goal with the amount and currency, credited to the flow that sent the link (or to the account when no flow sent it), plus a buyer tag. Stripe retries are de-duplicated by event id.
11. **Team alerts & activity log** — AI hand-offs, Notify admin steps and rule alerts post to Slack, Discord or Teams with a link to the chat; Settings keeps an activity log of who sent broadcasts, toggled or deleted flows, erased or merged contacts, and changed API keys or webhooks.
12. **API & webhooks** — `/api/v1` with API keys; signed outgoing webhooks for Zapier, Make or your backend.

Agencies get an **All accounts** page: every brand side by side (contacts, new this week, chats waiting, flows on, conversions) with one-click switching.

One process serves the web UI, the webhook, and the worker (`WORKER_MODE=all`).

## Local development

```bash
npm install
cp .env.example .env.local
# ENCRYPTION_KEY can stay unset locally (dev-only key). Required in production.
npm run dev
```

Open [http://127.0.0.1:43173](http://127.0.0.1:43173).

Without `DATABASE_URL` / `REDIS_URL`, Relay uses file-backed PGlite (`.data/relay`) and an in-memory queue. That is enough to run the UI and tests. For production-shaped local infra:

```bash
docker compose up -d
# then set DATABASE_URL and REDIS_URL from .env.example
```

```bash
npm test
npm run build
```

Local-only `POST /api/dev/seed` (disabled in production) creates a demo bot, a lead contact with CRM fields, an inbox thread, a growth link, and a broadcast sitting on the confirm gate — enough to click through the UI without Telegram. Connect a real BotFather token before anything should actually send.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | prod | Postgres. Local fallback: PGlite under `.data/` |
| `REDIS_URL` | prod | Queue + rate limits. Local fallback: memory |
| `ENCRYPTION_KEY` | prod | 32-byte key (64 hex chars, base64, or 32-char utf8). Encrypts bot tokens |
| `PUBLIC_URL` | prod | Public HTTPS origin used for `setWebhook` |
| `ADMIN_PASSWORD` | recommended | Shared console password. If unset, the UI is open |
| `WORKER_MODE` | no | `all` (default), `web`, or `worker` |
| `TELEGRAM_SENDS_PER_SECOND` | no | Default 20, capped at 25 |
| `PORT` | Railway | Next.js reads this automatically |
| `MEDIA_DIR` | no | Flow image/GIF uploads. Default `.data/media` |
| `ANTHROPIC_API_KEY` | for AI | Enables AI Steps, auto-reply, Live Chat suggestions and the flow builder (Claude) |
| `ZERNIO_API_BASE` | no | Override the Zernio API origin (default `https://zernio.com/api`) |
| `ADMIN_TELEGRAM_CHAT_ID` | no | Also send team alerts to a Telegram chat (Slack / Discord / Teams alerts are set per account in Settings) |

Never commit tokens or `.env*`. Tokens are never logged (outbound logs are redacted).

## Connect every social account (Zernio)

1. Connect Instagram, Facebook, WhatsApp, TikTok, X, LinkedIn and the rest in [Zernio](https://zernio.com).
2. In Zernio → Settings → API keys, create a key.
3. In Relay → **Settings**, choose **All socials (Zernio)**, paste the key and connect. Relay lists the linked accounts and registers its own signed webhook (DMs, comments, referrals) — set `PUBLIC_URL` first so Zernio can reach it.
4. Optional, also in Settings: **Payments** (Stripe webhook for revenue attribution), **Team alerts** (Slack / Discord / Teams), **Fields**, **Tags** and **Team**.
5. Start from a template under **Flows**, test it with **Test**, then switch it on.

## Connect a Telegram bot

1. Open Telegram and talk to [@BotFather](https://t.me/BotFather).
2. `/newbot`, copy the token. Do not paste it into chat logs or commit it.
3. Set `PUBLIC_URL` to the HTTPS origin Telegram can reach (Railway domain or an ngrok/Cloudflare tunnel for local webhooks).
4. In Relay → **Settings**, paste the token and connect. Relay stores it encrypted and calls `setWebhook` on `/api/telegram/webhook/<botId>`.
5. Use **Run health check** (`getMe` + `getWebhookInfo`).
6. Message the bot `/start`. The seeded lead-capture flow should ask for name, email, phone, and company, then tag `lead`.

Local webhooks need a tunnel:

```bash
# example
ngrok http 43173
# PUBLIC_URL=https://<subdomain>.ngrok.io
```

## Example `/start` lead-capture flow

Connecting a bot seeds this flow (also editable under **Flows** → open the flow → **Canvas**):

1. Welcome + buttons: **Yes, let's go** / **Not now**
2. Image/GIF intro (Telegram `sendAnimation`)
3. Capture **name** → **email** → **phone** → custom **company**
4. Apply tag `lead`
5. Closing confirmation

Answers write to the contact. Open **Contacts** or **Inbox**, or download **Export CSV**.

Keyword / command / growth-link flows work the same way: set the trigger, then add steps on the canvas.

### Growth links

**Admin → Growth → Links** creates trackable Telegram start links. Each link has a slug (Telegram start param), optional tag, optional linked flow, and optional UTM source/medium/campaign.

- Short URL `/go/<slug>` increments the click count, then 302s to `https://t.me/<bot>?start=<slug>`.
- QR codes are rendered by Relay itself (`/api/qr`, SVG), so links are not shared with a third-party QR service.
- Telegram `/start <slug>` attributes the contact (tag + UTM fields), increments starts, and kicks the linked flow. Attribution is applied before the flow runs so conditions can see the tag.
- Linked flows are matched through the engine’s existing `start_param` trigger — the flow canvas is unchanged.

You can also set a flow trigger to **Growth link** and a payload such as `promo` on the canvas. Share `https://t.me/<bot>?start=promo`. A generic `/start` flow still matches when the payload is missing or does not match.

Fresh seeds create an **Instagram bio** link (`ig_bio`) and a **Promo campaign** link (`promo`) plus the **Promo growth link** flow. Existing databases are not overwritten.

### Visual canvas

Open **Flows**, then click a flow (the seeded **Lead capture** flow appears after you connect a bot or run `POST /api/dev/seed`). The detail page is a ManyChat-style canvas:

1. Drag **Message**, **Image / GIF**, **Buttons**, **Lead form**, **User input**, **Tag**, **Set field**, **Subscribe**, **Condition**, **Delay**, or **Stop** from the left palette — or drop an image/GIF file onto the canvas.
2. Connect handles. Button edges show the choice label. Conditions have **Yes** / **No**. The trigger node’s outgoing edge is `startStepId`.
3. Select a node to edit copy, media, URL or callback buttons, form fields, tag add/remove, a CRM field value, subscribe/unsubscribe, delay seconds, or condition rules.

Subscribe writes a matching tag so tag-scoped broadcasts can target the list. Unsubscribe from `all` sets a contact-level opt-out; those contacts are excluded from the confirm-gated audience.
4. **Save** (or ⌘/Ctrl+S) writes the existing `FlowDefinition` (plus optional `canvas` layout). Telegram is unchanged.
5. **List** is the old form editor if you need raw step ids.

`npm test` includes serialize/deserialize smoke: canvas ↔ definition round-trips the seeded lead-capture and growth-link flows. The engine walks `/start`, `/start promo`, forms, conditions, delays, tag remove, set CRM field, and URL buttons. Media nodes persist `media.url` + `kind` on the text step.

### Images and GIFs

On a **Message**, **Image / GIF**, or **Buttons** node, upload or drop a JPEG/PNG/WebP/GIF, or paste an `https://` URL. Empty browser mime types still work when the filename ends in `.gif` / `.png` / `.jpg` / `.webp`.

- Uploads are stored under `MEDIA_DIR` (default `.data/media`) and served at `/api/media/:id`. Mount a Railway volume there if you want files to survive deploys. No extra API keys.
- Public HTTPS URLs are stored as-is. Telegram fetches them.
- Local uploads are sent as multipart (`sendPhoto` / `sendAnimation`) so Telegram does not need a public media URL.
- Broadcasts stay text-only; the confirm gate is unchanged.

## Zernio (every social network)

1. Connect accounts in Zernio and create an API key.
2. In Relay → **Settings**, choose **All socials (Zernio)** and paste the key. Optionally limit Relay to some Zernio account ids.
3. With `PUBLIC_URL` set, Relay registers `POST /api/zernio/webhook/<id>` for `message.received`, `comment.received` and `referral.received`, signed with its own secret (`X-Zernio-Signature`, HMAC-SHA256). Retries are deduped by `X-Zernio-Event-Id`.
4. Contacts remember their network, Zernio account and conversation, so flows, broadcasts, sequences and Live Chat reply in the right thread. Buttons render natively where the network supports them and as numbered text elsewhere.

Instagram and Facebook allow one private reply to a comment until the person answers, so a comment flow's first message should carry a button (Relay adds a **Continue** button when it has none); the rest of the flow continues from the tap.

When `ADMIN_PASSWORD` is set, Meta webhooks must be signed: add the app secret when connecting Instagram, Messenger or WhatsApp directly. Meta channels only deliver free-form messages inside the 24-hour window — use the **Last message within 24 hours** broadcast condition.

## AI

Set `ANTHROPIC_API_KEY`. In **AI assistant**, write a persona and paste your business knowledge (prices, hours, links, FAQs). Claude only states facts from that knowledge and hands off to a human otherwise.

- **AI Step** (canvas): give it a goal and fields to collect (`email, budget`). It chats until the goal is met, saves what it learned to the contact, then continues from its right-hand handle.
- **Auto-reply** answers messages no flow or keyword matched.
- **Live Chat** ✨ drafts three replies and summarizes intent and sentiment.
- **Build with AI** turns a sentence into an inactive draft flow.

Requests use `claude-opus-5-5` with structured outputs, prompt caching and server-side refusal fallbacks.

## API & webhooks

Create a key under **API & webhooks**, then:

```bash
curl -H "Authorization: Bearer rly_…" "$PUBLIC_URL/api/v1/contacts?tag=lead"
curl -X PATCH -H "Authorization: Bearer rly_…" -H 'content-type: application/json' \
  -d '{"add_tags":["customer"],"fields":{"plan":"pro"}}' "$PUBLIC_URL/api/v1/contacts/<id>"
curl -X POST -H "Authorization: Bearer rly_…" -H 'content-type: application/json' \
  -d '{"flow_id":"<flow>"}' "$PUBLIC_URL/api/v1/contacts/<id>/flows"
```

Endpoints: `GET /me`, `GET /contacts`, `GET|PATCH /contacts/:id`, `POST /contacts/:id/flows`, `POST /contacts/:id/messages`, `GET /flows`, `GET /tags`.

Webhooks POST `{ id, event, created_at, data }` for `contact.created`, `message.received`, `contact.tag_added`, `contact.tag_removed`, `contact.field_set`, `contact.subscribed`, `flow.completed` and `conversation.handoff`. Verify `X-Relay-Signature` (hex HMAC-SHA256 of the raw body with the endpoint's signing secret).

## Broadcasts (confirm is a hard gate)

1. Pick the audience: everyone subscribed or a tag, narrowed by conditions. The count updates live.
2. Write a message or pick a flow to send. That only creates `awaiting_confirm`.
3. On the broadcast page, type `CONFIRM` and send now or pick a time. The API rejects anything except `{ "confirm": true }` on `/api/broadcasts/:id/confirm`. Scheduled broadcasts work out their audience when they send.
4. The worker sends with a per-account rate limit and records sent/failed. Unsubscribed contacts are always skipped.

Delete bot / flow / tag / field also require `confirm: true`.

## Railway (one service)

v1 is a single web service: HTTP + webhook + in-process worker.

1. Create a Railway project. Add **Postgres** and **Redis**.
2. Create one service from this repo (or deploy the Dockerfile). Nixpacks: `npm run build` / `npm run start`.
3. Attach `DATABASE_URL` and `REDIS_URL` from those plugins.
4. Set `ENCRYPTION_KEY` (32 bytes), `PUBLIC_URL` (the Railway HTTPS domain), and `ADMIN_PASSWORD`.
5. Health check: `/api/health`.
6. Generate a domain. Confirm `PUBLIC_URL` matches it, then connect the bot so the webhook URL is public.

If GitHub App access is missing, deploy from the Origin remote or a connected GitHub repo — do not dual-write unless you intend to.

### Split the worker later

Same image, two Railway services:

| Service | `WORKER_MODE` | Notes |
| --- | --- | --- |
| web | `web` | UI + webhook. Enqueues only |
| worker | `worker` | Consumes Redis queues, sends Telegram |

Keep both on the same Postgres + Redis. Do not run two `all` instances against one queue unless you accept competing consumers (the queue is still safe; webhook latency just varies).

## Schema

Postgres tables: `bots`, `contacts`, `tags`, `contact_tags`, `custom_fields`, `contact_field_values`, `flows`, `flow_sessions`, `flow_events`, `messages`, `saved_replies`, `broadcasts`, `broadcast_recipients`, `growth_links`, `growth_link_events`, `sequences`, `sequence_steps`, `sequence_subscriptions`, `automation_rules`, `api_keys`, `webhook_subscriptions`.

SQL lives in `src/lib/db/sql.ts` and is applied on boot. Drizzle schema: `src/lib/db/schema.ts`.

## Tests

```bash
npm test
```

Covers lead-capture field writes + the full `/start` example flow, growth-link `/start` payloads, forms/conditions/delays/tag remove/URL buttons, and the confirm-before-broadcast gate (missing/false/`"true"` are all rejected).
