# Relay

Telegram automation for HI Studio. Inbox, lead-capture flows, CRM tags/fields, and tag-scoped broadcasts with a hard confirm gate.

Telegram only in v1. No Instagram, Facebook, or WhatsApp. No scraping. Sends are rate-limited.

Origin is the source of truth for this project.

## What v1 does

1. **Bot connect** — paste a BotFather token. Relay calls `getMe`, encrypts the token (`ENCRYPTION_KEY`), sets the webhook, and health-checks it.
2. **Contacts** — upsert on `/start` and every inbound message (Telegram user id, username, name).
3. **Tags + CRM fields** — native name/email/phone plus custom fields (company is seeded).
4. **Lead capture** — flow steps write answers onto the contact. Visible in inbox/CRM and CSV export.
5. **Flows** — triggers: `/start`, growth-link `/start <payload>`, command, exact keyword. Steps: text (optional image/GIF), callback or HTTPS URL buttons, capture, lead form, condition (yes/no), delay, tag add/remove, subscribe/unsubscribe, end. Admins edit them on a drag-and-drop canvas (React Flow); the engine still runs the same `FlowDefinition`. Telegram sends photos via `sendPhoto` and GIFs via `sendAnimation`.
6. **Broadcasts by tag** — compose audience, then **Confirm** (`confirm: true`) before anything queues. Status is tracked.
7. **Live inbox** — inbound/outbound thread per contact; human reply from the UI.

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

Local-only `POST /api/dev/seed` (disabled in production) creates a demo bot, a lead contact with CRM fields, an inbox thread, and a broadcast sitting on the confirm gate — enough to click through the UI without Telegram. Connect a real BotFather token before anything should actually send.

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

Never commit tokens or `.env*`. Tokens are never logged (outbound logs are redacted).

## Connect a bot

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

Set the trigger to **Growth link** and a payload such as `promo`. Share `https://t.me/<bot>?start=promo`. Telegram delivers `/start promo`, and Relay starts that flow. A generic `/start` flow still matches when the payload is missing or does not match any growth-link flow.

Fresh seeds also create **Promo growth link** (`/start promo`) with a lead form, condition, delay, URL button, and tag. Existing databases are not overwritten.

### Visual canvas

Open **Flows**, then click a flow (the seeded **Lead capture** flow appears after you connect a bot or run `POST /api/dev/seed`). The detail page is a ManyChat-style canvas:

1. Drag **Message**, **Image / GIF**, **Buttons**, **Lead form**, **User input**, **Tag**, **Subscribe**, **Condition**, **Delay**, or **Stop** from the left palette — or drop an image/GIF file onto the canvas.
2. Connect handles. Button edges show the choice label. Conditions have **Yes** / **No**. The trigger node’s outgoing edge is `startStepId`.
3. Select a node to edit copy, media, URL or callback buttons, form fields, tag add/remove, subscribe/unsubscribe, delay seconds, or condition rules.

Subscribe writes a matching tag so tag-scoped broadcasts can target the list. Unsubscribe from `all` sets a contact-level opt-out; those contacts are excluded from the confirm-gated audience.
4. **Save** (or ⌘/Ctrl+S) writes the existing `FlowDefinition` (plus optional `canvas` layout). Telegram is unchanged.
5. **List** is the old form editor if you need raw step ids.

`npm test` includes serialize/deserialize smoke: canvas ↔ definition round-trips the seeded lead-capture and growth-link flows. The engine walks `/start`, `/start promo`, forms, conditions, delays, tag remove, and URL buttons. Media nodes persist `media.url` + `kind` on the text step.

### Images and GIFs

On a **Message**, **Image / GIF**, or **Buttons** node, upload or drop a JPEG/PNG/WebP/GIF, or paste an `https://` URL. Empty browser mime types still work when the filename ends in `.gif` / `.png` / `.jpg` / `.webp`.

- Uploads are stored under `MEDIA_DIR` (default `.data/media`) and served at `/api/media/:id`. Mount a Railway volume there if you want files to survive deploys. No extra API keys.
- Public HTTPS URLs are stored as-is. Telegram fetches them.
- Local uploads are sent as multipart (`sendPhoto` / `sendAnimation`) so Telegram does not need a public media URL.
- Broadcasts stay text-only; the confirm gate is unchanged.

## Broadcasts (confirm is a hard gate)

1. Tag the audience (broadcasts are tag-scoped — no “send to everyone”).
2. Compose the message. That only creates `awaiting_confirm`.
3. On the broadcast page, type `CONFIRM` and send. The API rejects anything except `{ "confirm": true }` on `/api/broadcasts/:id/confirm`.
4. The worker sends with a per-bot rate limit and records sent/failed.

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

Postgres tables: `bots`, `contacts`, `tags`, `contact_tags`, `custom_fields`, `contact_field_values`, `flows`, `flow_sessions`, `messages`, `broadcasts`, `broadcast_recipients`.

SQL lives in `src/lib/db/sql.ts` and is applied on boot. Drizzle schema: `src/lib/db/schema.ts`.

## Tests

```bash
npm test
```

Covers lead-capture field writes + the full `/start` example flow, growth-link `/start` payloads, forms/conditions/delays/tag remove/URL buttons, and the confirm-before-broadcast gate (missing/false/`"true"` are all rejected).
