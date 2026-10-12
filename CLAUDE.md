@AGENTS.md

# Recatch (the repo is still called relay)

Social DM automation: comment to DM, flows, a shared inbox, broadcasts, CRM and Claude-powered replies. One process serves the web UI, the webhooks and the worker. `README.md` covers features and setup. `INTEGRATIONS.md` is the handover document for every platform: what is live, what is waiting and on whom, where each account lives, and the order to resume in. Keep it current as you work.

## Names

The product is Recatch (renamed from Relay). User-facing text says Recatch. Keep the old name wherever something already deployed or integrated depends on it: the repo and Railway project, the `relay_session` cookie, the `rly_` API key prefix, the `X-Relay-Signature` webhook header and the `relay` key in exported flow files.

## Commands

- `npm run dev` serves on port 43173. Without `DATABASE_URL` and `REDIS_URL` it uses PGlite under `.data/` and an in-memory queue, which is enough for the UI and tests.
- `npm test`, `npx tsc --noEmit` and `npm run build` should all pass before anything is pushed.
- The person you work with is on Windows. Any command you ask them to run has to be for PowerShell (say so, and say the folder). Never hand them bash or Unix-only commands.

## Deploying

Railway deploys every push to `main`, which takes five to six minutes (the old build keeps serving until the new one is up, so a change is not live the moment a deploy shows as started). Live at https://recatch.app (the old `relay-production-71da.up.railway.app` address still works). `GET /api/health` reports the service and database state.

Environment variables live in Railway and never in the repo or in chat. `.env.example` and the table in `README.md` list the names.

`proxy.ts` answers every signed-out `/api/*` request with 401, route or not, so a 401 does not prove a new route is deployed. Check from a signed-in browser instead. After a push, run `railway deployment list --service recatch` too: the CLI is linked to the production project, and a failed build keeps the old one serving. `railway logs --build --service recatch <deployment id>` shows why it failed.

## Things that have bitten before

- This is a recent Next.js with breaking changes. Read the guide in `node_modules/next/dist/docs/` before using an API you are not sure of (see `AGENTS.md`).
- A route file may only export HTTP handlers and route config. Put shared constants in `src/lib/`. Sibling dynamic segments must share one name, so use a static segment like `item/[id]` when a second route would clash.
- A new table goes in two places: `src/lib/db/schema.ts` and the migration SQL in `src/lib/db/sql.ts`. `schema-sql.test.ts` fails when they disagree.
- Railway installs with `npm ci` on node 22 (npm 10.9.9), which refuses a lock file written by a newer npm that is missing optional entries (it failed on `@emnapi/runtime`). After adding or changing a dependency, run `npx npm@10.9.9 install --package-lock-only --ignore-scripts`, then check `npx npm@10.9.9 ci --dry-run --ignore-scripts` prints no `Missing`. A failed deploy keeps the old build serving, so check `railway deployment list --service recatch` rather than assuming a push went live.
- Pages and routes reachable while signed out are listed in `src/proxy.ts`. An entry matches the whole path or whatever sits under it after a slash, so a file with an extension (`client-metadata.json`) needs its full name listed. `src/proxy.test.ts` goes through the real proxy; route tests that call a handler directly skip it and cannot catch a missing entry.
- Tests that need the database change into a temp directory before the first `getDb()`, mock `@/lib/auth` for `requireUserId`, and stub `fetch` for providers. They never call real services. `src/lib/oauth/oauth.integration.test.ts` is the pattern to copy.
- The working tree uses CRLF line endings. A script that edits files should keep the file's existing endings.
- Vitest allows 20 seconds per test and 30 for setup, because integration suites load big libraries and start a database while many run at once. `broadcast A/B split` is slow (about a second alone). If something still times out, rerun it by itself before treating the failure as real.
- Slack read methods such as `users.info` only accept form-encoded parameters. JSON is for `chat.*`. A fake that accepts both hides the bug.
- A Discord DM carries no server, so the shared bot cannot tell which customer a DM is for. People run `/chat` in the server, and `discord_routes` remembers it. Never let two connections hold the same bot token, or every DM is answered twice.
- Bluesky's `bsky.social` is only the sign-in entryway. Chat calls must go to the account's own server (in the sign-in response), or they answer Method Not Implemented.
- Pages that read an environment variable at request time need `export const dynamic = "force-dynamic"`, or the build bakes in the value it saw.

## Where things are

- `src/lib/channels/`: one adapter per messaging channel (Telegram, Meta, WhatsApp, Discord, Slack, Bluesky, Zernio). `index.ts` dispatches sends and inbound parsing. `src/lib/webhook.ts` runs every inbound event through the flow engine.
- The design rule for a new channel: customers connect with one click through an app the company owns (Add to Slack, Add to Discord, Sign in with Bluesky), and pasting their own token is only the fallback. Telegram is the exception because it has no company-wide API. Each platform's company app, its variables and its gotchas are in `INTEGRATIONS.md`.
- Slack: `slack.ts` (send, parse, signatures), `slack-install.ts` (OAuth), `slack-webhook.ts` (one handler shared by the per-app URL and the shared `/api/slack/events`). Bluesky: `bluesky.ts` (chat calls, polling log), `bluesky-manager.ts` (the poller, started from `startup.ts`), `bluesky-oauth.ts` (Bluesky's OAuth client, settings and the encrypted session store). Shared Discord bot: `discord-install.ts`, `discord-shared.ts`.
- Discord is different from the others: it delivers DMs over a persistent websocket, not a webhook. `discord-gateway.ts` is the connection (heartbeat, resume, backoff), and `discord-manager.ts` keeps one per connected bot and re-syncs every minute from `startup.ts`, and skips servers added through Add to Discord, which share the one bot held by `discord-shared.ts`. Run only one instance with the worker on, or every DM is answered twice. The Bluesky poller has the same single-instance rule.
- `src/lib/oauth/` and `src/app/api/connections/`: Connected apps (YouTube, TikTok). These are sign-in and read connections, not messaging channels. To add a provider, add its config in `providers.ts`, its env keys, and tests. Anything that calls a provider's API gets its token from `getAccessToken`, never from the database directly.
- `src/app/(marketing)/`: the public site, including the privacy, terms and data deletion pages that every platform application asks for.

## Looking at the live database

The Railway Postgres is only reachable from inside Railway (`postgres.railway.internal`), and there is no public URL. To run a query, link the CLI to the `recatch.app` project (production) and run it from the service: `railway ssh --service recatch -- node -e "..."` using `require("postgres")` and `process.env.DATABASE_URL`. Nothing prints a secret that way. Start read-only.

Accounts are rows in `users`. Connected channel accounts (`bots`) belong to a user through `owner_id`, and the app only shows a login its own bots. Rows from before logins existed have a null `owner_id`, so they are invisible to everyone until someone assigns them (`update bots set owner_id = <user id> where id = <bot id> and owner_id is null`). Contacts, flows and messages hang off the bot, so they follow it. If someone says an account or its data is missing, check for bots with a null owner first.

## Platform applications

The developer apps (Google, Pinterest, TikTok, Meta, Slack, Discord) belong to the company admin account, not to anyone's personal login. Client secrets, passwords and tokens are entered into Railway by a person and are not read or written anywhere else. Claude's permission settings block writing to a secret store, so give the person a PowerShell command to run. Bluesky's signing key is made by `scripts/bluesky-keygen.mjs` and piped into Railway with `--stdin`, so it never shows on screen. Meta's account checks, CAPTCHAs and any consent given on someone's own account are done by that person. Platform review forms often want a demo video of the working flow, so build and test the connection in Recatch before applying. TikTok's production form does not keep a draft, so set things up in its sandbox first.
