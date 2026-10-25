# Recatch

Social DM automation for HI Studio — a ManyChat-style platform for every network. Comment-to-DM, story replies, flows on a canvas, a shared Live Chat inbox, CRM, segmented broadcasts, analytics, and Claude-powered AI.

Connect Telegram, Slack, Discord, Bluesky, Instagram, Messenger and WhatsApp. Slack, Discord and Bluesky connect with one click through an app the company owns. The Channels page also lists what is coming next (Threads, X, TikTok, Reddit, YouTube, LinkedIn, Pinterest, iMessage) greyed out. No scraping. Sends are rate-limited.

Origin is the source of truth for this project.

## What it does

1. **Channels** — Add to Slack, Add to Discord, Sign in with Bluesky, Sign in with Facebook for Instagram, Messenger and WhatsApp, a BotFather token or your own Meta token. Credentials are encrypted at rest (`ENCRYPTION_KEY`).
2. **Comment → DM** (Instagram and Facebook, through the one-click Meta connection) — keyword + post filters, random public replies or **AI-written public replies** to each comment, a private-reply opening DM, once per person per post, optional hide-after-reply. Story reply and story mention triggers. Account-wide **comment moderation** hides comments with blocked words or links before any automation runs.
3. **Flows** — a drag-and-drop canvas: Send Message (text, media, buttons, quick replies, typing), **Gallery** (swipeable product cards; native carousel on Instagram/Messenger, one message per card elsewhere), User input (with number, date and link reply types), Lead form, Tag, Set field, Subscribe, Condition, Smart Delay, A/B split, Start flow, HTTP request, Notify admin, **AI Step**, **Goal** (conversions + revenue), Stop, sticky **notes** for your team, plus undo/redo (⌘Z / ⇧⌘Z) and copy/paste of steps. Triggers: welcome, keywords, commands, growth links, comments, stories, **AI intent** (Claude matches what someone means, in any wording or language), default reply (every time or once per 24h). Fifteen starter **templates** (follow-to-unlock, product gallery, lead-scoring quiz, AI support router, appointment booking, Stripe checkout, AI qualifier…), an **in-browser simulator**, **version history** with one-click restore, JSON **export / import** to move flows between accounts, and per-node sent/click/conversion stats. `{{bot.key}}` bot fields hold shared values (prices, links) for every flow.
4. **AI (Claude)** — AI Step (chats toward a goal, collects fields, continues the flow or hands off), AI auto-reply from your knowledge base (paste it, or **import it from your website**) with a **playground** to chat with it before going live, Live Chat reply suggestions + summaries, "describe a flow, get a draft", one-tap **AI rewrite** of any message (shorter, friendlier, more persuasive, emoji, grammar) in the brand voice, and **AI auto-tags** (describe a tag in plain words; Claude applies it when a message fits, which can start sequences, rules and webhooks).
5. **Live Chat** — three-pane inbox across every network: filters (open / needs reply / mine / unassigned / closed), team assignment with round-robin AI hand-offs, bulk select (mark done, assign), saved replies (`/`, with {{first_name}}-style variables), a **CSAT survey** when a chat is marked Done, **scheduled replies** (send later), **snooze** (until a time or their next message), collision alerts when a teammate is viewing or typing, tags, notes, automation pause/resume, AI copilot, two-way **AI translation**, the 24-hour messaging window, desktop notifications, an unread count in the tab title, and `j`/`k` keyboard navigation. A human reply or AI hand-off pauses the bot for that person.
6. **Contacts & CRM** — tags, custom fields, lists; segment filters with **saved segments** (reuse in Contacts and Broadcasts), bulk actions, CSV import/export, and a profile with lifetime value plus privacy tools (download a person's data, erase them), and **duplicate merge** for the same person on several networks (same email or phone); after a merge they stay one contact whichever network they write from.
7. **Broadcasts** — segments (tag, field, platform, list, last message within N hours, join date), send a message or a whole flow, schedule, **smart send time** (each person gets it at the hour they usually message, within 24h), **A/B tests** (two versions, 50/50 split, reply rate within 48h), **send a test** to yourself first, **AI drafting** (describe the goal, get versions A and B), **duplicate** a past send into a fresh draft, and an explicit confirm before anything queues.
8. **Growth** — trackable links (`/go/<slug>`), QR codes, attribution; Instagram ice breakers, Messenger menu, business hours with an away message.
9. **Analytics** — overview dashboard with an **AI weekly digest** (what happened, what to do next), a getting-started checklist, a Live Chat team report (replies, conversations, median first response and CSAT per teammate), per-flow runs / CTR / completion / conversions / revenue, AI conversation insights.
10. **Payments** — Stripe Payment Links in flows (`?client_reference_id={{contact_id}}`); a signed Stripe webhook turns each checkout into a goal with the amount and currency, credited to the flow that sent the link (or to the account when no flow sent it), plus a buyer tag. Stripe retries are de-duplicated by event id.
11. **Team alerts & activity log** — AI hand-offs, Notify admin steps and rule alerts post to Slack, Discord or Teams with a link to the chat; Settings keeps an activity log of who sent broadcasts, toggled or deleted flows, erased or merged contacts, and changed API keys or webhooks.
12. **API & webhooks** — `/api/v1` with API keys; signed outgoing webhooks for Zapier, Make or your backend.

Agencies get an **All accounts** page: every brand side by side (contacts, new this week, chats waiting, flows on, conversions) with one-click switching.

One process serves the web UI, the webhook, and the worker (`WORKER_MODE=all`).

## Plans and billing

Recatch is paid. There is no free plan and no trial. The plans section on the home page (`/welcome#plans`) shows the regular price, the first-month price when the launch offer applies, and the renewal price. A plan button goes to signup, then Stripe Checkout, then the workspace at `/setup`.

The catalog and the promo live in `src/lib/billing/config.ts`. With the env vars unset, every plan is 50% off the first month and renews at the normal price. `BILLING_PROMO_ENABLED=false` turns the offer off, and `BILLING_PROMO_PLAN_IDS` limits it to specific plans. Checkout uses `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test keys until you are ready to charge cards). Prices stay in USD (`recatch_{plan}_month_{cents}` lookup keys and Checkout `plan_id` metadata). Tax and Adaptive Pricing can change the charged amount and the presentment currency, so the plan is never inferred from the amount. Checkout collects a billing address and a tax ID, and shows the browser locale. Stripe Tax stays off until `STRIPE_AUTOMATIC_TAX=true`, and only after a tax registration exists in the Stripe account. If the Stripe env vars are missing, the plans page still renders and signup lands on `/billing` with the workspace closed, instead of failing the request.

The webhook is `PUBLIC_URL/api/billing/webhook`. It is what opens and closes the workspace after checkout, renewal, a failed invoice, cancellation, a full refund, a dispute or an early fraud warning. A Checkout session opens the workspace only when `payment_status` is `paid` (`checkout.session.completed` or `checkout.session.async_payment_succeeded`). Renewals read the subscription from `invoice.parent.subscription_details.subscription` and the paid state from `invoice.status`. The Checkout session and the first invoice (`billing_reason=subscription_create`) record one payment; a later invoice records the next one. The return page confirms the same Checkout session with Stripe so someone who does come back is not stuck waiting, but a missing return visit still provisions from the webhook.

## Local development

```bash
npm install
cp .env.example .env.local
# ENCRYPTION_KEY can stay unset locally (dev-only key). Required in production.
npm run dev
```

Open [http://127.0.0.1:43173](http://127.0.0.1:43173).

Without `DATABASE_URL` / `REDIS_URL`, Recatch uses file-backed PGlite (`.data/relay`) and an in-memory queue. That is enough to run the UI and tests. For production-shaped local infra:

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
| `PUBLIC_CONTACT_EMAIL` | prod | Contact address on the privacy, terms and data deletion pages. Meta, Google and TikTok reviews check these pages |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | OAuth client from the Google Cloud project. Turns on Connect for YouTube under Connected apps |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | no | Client key and secret from the TikTok developer app. Turns on Connect for TikTok |
| `ZERNIO_API_KEY` / `ZERNIO_WEBHOOK_SECRET` | no | The company Zernio key and the signing secret of the one webhook registered in Zernio. Both turn on the one-click Instagram, Messenger and WhatsApp buttons. Without them people can still paste their own Meta token |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | no | From the company Slack app (create it from `slack-app-manifest.json`). All three turn on the Add to Slack button; without them people can still paste their own Slack app's token |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` | no | From the company Discord application (client id is the application id, the bot token is shown once on the Bot page). All three turn on the Add to Discord button and the shared bot; without them people can still paste their own bot's token |
| `BLUESKY_OAUTH_KEY` | no | Private signing key for Sign in with Bluesky, one line of JSON from `node scripts/bluesky-keygen.mjs`. Needs an https `PUBLIC_URL`. Turns on the sign-in button; without it people use an app password |
| `SESSION_SECRET` | prod | Signs login cookies. Falls back to `ENCRYPTION_KEY` |
| `RELAY_OWNER_EMAIL` / `RELAY_OWNER_PASSWORD` | first boot | Creates the workspace owner if missing and assigns accounts connected before logins existed. `RELAY_OWNER_NAME` is optional |
| `WORKER_MODE` | no | `all` (default), `web`, or `worker` |
| `TELEGRAM_SENDS_PER_SECOND` | no | Default 20, capped at 25 |
| `PORT` | Railway | Next.js reads this automatically |
| `MEDIA_DIR` | no | Only for reading uploads saved on disk before they moved into the database. Default `.data/media` |
| `ANTHROPIC_API_KEY` | optional | Server-wide AI (Claude) for accounts that have not saved their own key. Accounts can instead save their own key (Anthropic, OpenAI, Google Gemini, xAI, Mistral, Groq, DeepSeek or OpenRouter) on the AI assistant page, and the Recatch Assistant on Overview uses that key too when one of the login's accounts has it. With neither, the assistant says it is not switched on |
| `ASSISTANT_MONTHLY_BUDGET_USD` | no | What the Overview assistant may spend on `ANTHROPIC_API_KEY` per login per UTC month. Default `5`; `0` turns it off on the server key. Logins on their own AI key are not counted |
| `OPENAI_API_KEY` | no | The assistant's natural voice (OpenAI `gpt-4o-mini-tts`). Each spoken sentence is priced per character and counted in the same monthly allowance. A login whose account saved its own OpenAI key speaks on that key instead, uncounted. Without either, the browser's own voices speak |
| `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `EMAIL_FROM` | for email | Amazon SES for password reset, welcome and hand-off emails. All four or email stays off. `EMAIL_FROM` must be verified in SES. Optional: `EMAIL_REPLY_TO`, `AWS_SES_SESSION_TOKEN` |
| `AWS_SES_SNS_TOPIC_ARN` | no | The SNS topic SES publishes bounces and complaints to. Subscribe `https://<your domain>/api/email/feedback` to it (HTTPS); Recatch confirms the subscription and stops mailing addresses that hard-bounce or complain |
| `ADMIN_TELEGRAM_CHAT_ID` | no | Also send team alerts to a Telegram chat (Slack / Discord / Teams alerts are set per account in Settings) |

Never commit tokens or `.env*`. Tokens are never logged (outbound logs are redacted).

## Getting started

1. In Recatch go to **Channels** and connect an account: Telegram, Slack, Discord, Bluesky, or Instagram, Messenger and WhatsApp with your own Meta app. Set `PUBLIC_URL` first so webhooks can reach Recatch.
2. Optional, in Settings: **Payments** (Stripe webhook for revenue attribution), **Team alerts** (Slack / Discord / Teams), **Fields**, **Tags** and **Team**.
3. Start from a template under **Flows**, test it with **Test**, then switch it on.

## Connect Slack, Discord or Bluesky

In **Channels** (the Setup page), pick the platform and use the one-click button. Each needs the company app set up once and its variables in Railway (see the environment table and `INTEGRATIONS.md`). Until then the page shows the paste-your-own form instead.

- **Slack:** **Add to Slack**, approve in the workspace. People message the Recatch app and the flows answer.
- **Discord:** **Add to Discord**, pick the server. Members type `/chat` in the server and Recatch starts a private chat with them.
- **Bluesky:** **Sign in with Bluesky**, approve on Bluesky. Recatch polls for new direct messages every few seconds. Buttons arrive as a numbered list and people answer by typing the number. Replies under your own posts count as comments, so comment automations work there too: the public reply goes into the thread, and the rest of the flow goes out as a DM if the person accepts DMs from you.

## Connect a Telegram bot

1. Open Telegram and talk to [@BotFather](https://t.me/BotFather).
2. `/newbot`, copy the token. Do not paste it into chat logs or commit it.
3. Set `PUBLIC_URL` to the HTTPS origin Telegram can reach (Railway domain or an ngrok/Cloudflare tunnel for local webhooks).
4. In Recatch → **Settings**, paste the token and connect. Recatch stores it encrypted and calls `setWebhook` on `/api/telegram/webhook/<botId>`.
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
- QR codes are rendered by Recatch itself (`/api/qr`, SVG), so links are not shared with a third-party QR service.
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

- Uploads, and copies of images and files people send in a DM, are stored in Postgres (`media_files`) and served at `/api/media/:id`. They used to sit on the container disk, which every deploy wiped. Platform links to received media expire, which is why Recatch keeps its own copy. No extra API keys.
- Public HTTPS URLs are stored as-is. Telegram fetches them.
- Local uploads are sent as multipart (`sendPhoto` / `sendAnimation`) so Telegram does not need a public media URL.
- Broadcasts stay text-only; the confirm gate is unchanged.

## Meta (Instagram, Messenger, WhatsApp)

With `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` set, each customer connects these with one click. Recatch keeps one Zernio key, and every customer is one Zernio profile (its external id is the Recatch user id), so one customer's accounts never show up in another's. In Zernio, register a single webhook at `PUBLIC_URL/api/zernio/webhook` with the signing secret from `ZERNIO_WEBHOOK_SECRET` and the events `message.received`, `comment.received`, `referral.received`, `account.connected` and `account.disconnected`. Zernio bills the company per connected account, so a customer who removes their Meta account (or an account) stops that cost.

In production, Meta webhooks must be signed: add the app secret when connecting Instagram, Messenger or WhatsApp directly. Meta channels only deliver free-form messages inside the 24-hour window — use the **Last message within 24 hours** broadcast condition.

## AI

Either set `ANTHROPIC_API_KEY` on the server, or let each account save its own key and model in **AI assistant**: Anthropic, OpenAI, Google Gemini, xAI, Mistral, Groq, DeepSeek or OpenRouter (stored encrypted per account, so they pay for their own usage). An Anthropic key runs exactly like the server key (Claude Opus 5.5, Sonnet 5.5 or Haiku 5.5); the others go through each provider's OpenAI-compatible API with any model id. In **AI assistant**, write a persona and paste your business knowledge (prices, hours, links, FAQs). Claude only states facts from that knowledge and hands off to a human otherwise.

- **AI Step** (canvas): give it a goal and fields to collect (`email, budget`). It chats until the goal is met, saves what it learned to the contact, then continues from its right-hand handle.
- **Auto-reply** answers messages no flow or keyword matched.
- **Live Chat** ✨ drafts three replies and summarizes intent and sentiment.
- **Build with AI** turns a sentence into an inactive draft flow.
- **Recatch Assistant** sits at the top of Overview for every login, in every view (one account, All channels, and before anything is connected). You type or press **Talk**: voice mode listens through the browser's speech recognition and reads the answers aloud sentence by sentence as the answer streams in (Chrome, Edge and Safari can listen). It speaks in a natural voice from OpenAI text to speech (`/api/agent/speech`, `src/lib/agent/speech.ts`; Marin by default, seven more in the voice menu) when `OPENAI_API_KEY` is set or one of the login's accounts saved its own OpenAI key. The company key's speech counts against the monthly allowance below at about $0.018 a minute (`SPEECH_MICROS_PER_CHAR`), and 600 sentences an hour per login. The browser's own voices are the fallback: with no key, once the allowance is used up, or when OpenAI fails, the rest of the session speaks in the browser's voice and says why. It walks new customers through setup using the Get set up checklist, builds funnels from the templates or from scratch, and reads every channel you own (contacts, tags, lead fields, flow stats). Everything it makes is a **draft**: it cannot turn a flow on, send a broadcast, or message anyone. Those still need a click in the app. It runs on the AI key one of the login's own accounts has saved, any provider (the most recently updated account with a key wins), so that customer pays for it; otherwise on `ANTHROPIC_API_KEY`, within a monthly allowance per login (`ASSISTANT_MONTHLY_BUDGET_USD`, $5 by default). Every Claude call is priced from the tokens it used (`src/lib/agent/pricing.ts`), added to that login's month in `assistant_usage`, and checked before the next call; the card shows what is left and when it resets. With no key at all, the card says the assistant is not switched on. It stays with you on every page: Overview shows it as a card, every other page has an **Ask Recatch** button that opens it beside the page, and a conversation or voice session carries on as you move around. Ask it to show you something ("open my flows") and it opens the page while it keeps talking; it also knows which page you are on. Chat history is stored per login (New chat clears it), and each login gets 30 messages an hour.

Requests use `claude-opus-5-5` with structured outputs, prompt caching and server-side refusal fallbacks. The Overview assistant uses the same model with tool calls, streamed, at medium effort (low when talking, for quicker answers), or the account's own provider and model when it runs on that key (the model has to support tool calling).

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
4. Set `ENCRYPTION_KEY` (32 bytes), `PUBLIC_URL` (the Railway HTTPS domain), and `RELAY_OWNER_EMAIL` / `RELAY_OWNER_PASSWORD` for your own login. Anyone else picks a plan at `/welcome#plans`, creates an account at `/signup`, and pays before the workspace opens. Accounts that already existed keep access.
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
