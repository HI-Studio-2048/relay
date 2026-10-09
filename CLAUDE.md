@AGENTS.md

# Recatch (the repo is still called relay)

Social DM automation: comment to DM, flows, a shared inbox, broadcasts, CRM and Claude-powered replies. One process serves the web UI, the webhooks and the worker. `README.md` covers features and setup. `INTEGRATIONS.md` is the handover document for every platform: what is live, what is waiting and on whom, where each account lives, and the order to resume in. Keep it current as you work.

## Names

The product is Recatch (renamed from Relay). User-facing text says Recatch. Keep the old name wherever something already deployed or integrated depends on it: the repo and Railway project, the `relay_session` cookie, the `rly_` API key prefix, the `X-Relay-Signature` webhook header and the `relay` key in exported flow files.

## Commands

- `npm run dev` serves on port 43173. Without `DATABASE_URL` and `REDIS_URL` it uses PGlite under `.data/` and an in-memory queue, which is enough for the UI and tests.
- `npm test`, `npx tsc --noEmit` and `npm run build` should all pass before anything is pushed.

## Deploying

Railway deploys every push to `main`, which takes three to four minutes. Live at https://recatch.app (the old `relay-production-71da.up.railway.app` address still works). `GET /api/health` reports the service and database state.

Environment variables live in Railway and never in the repo or in chat. `.env.example` and the table in `README.md` list the names.

`proxy.ts` answers every signed-out `/api/*` request with 401, route or not, so a 401 does not prove a new route is deployed. Check from a signed-in browser instead.

## Things that have bitten before

- This is a recent Next.js with breaking changes. Read the guide in `node_modules/next/dist/docs/` before using an API you are not sure of (see `AGENTS.md`).
- A route file may only export HTTP handlers and route config. Put shared constants in `src/lib/`. Sibling dynamic segments must share one name, so use a static segment like `item/[id]` when a second route would clash.
- A new table goes in two places: `src/lib/db/schema.ts` and the migration SQL in `src/lib/db/sql.ts`. `schema-sql.test.ts` fails when they disagree.
- Pages and routes reachable while signed out are listed in `src/proxy.ts`.
- Tests that need the database change into a temp directory before the first `getDb()`, mock `@/lib/auth` for `requireUserId`, and stub `fetch` for providers. They never call real services. `src/lib/oauth/oauth.integration.test.ts` is the pattern to copy.
- The working tree uses CRLF line endings. A script that edits files should keep the file's existing endings.
- Pages that read an environment variable at request time need `export const dynamic = "force-dynamic"`, or the build bakes in the value it saw.

## Where things are

- `src/lib/channels/`: one adapter per messaging channel (Telegram, Meta, WhatsApp, Zernio). `index.ts` dispatches sends and inbound parsing. `src/lib/webhook.ts` runs every inbound event through the flow engine.
- `src/lib/oauth/` and `src/app/api/connections/`: Connected apps (YouTube, TikTok). These are sign-in and read connections, not messaging channels. To add a provider, add its config in `providers.ts`, its env keys, and tests. Anything that calls a provider's API gets its token from `getAccessToken`, never from the database directly.
- `src/app/(marketing)/`: the public site, including the privacy, terms and data deletion pages that every platform application asks for.

## Platform applications

The developer apps (Google, Pinterest, TikTok, Meta) belong to the company admin account, not to anyone's personal login. Client secrets, passwords and tokens are entered into Railway by a person and are not read or written anywhere else. Meta's account checks, CAPTCHAs and any consent given on someone's own account are done by that person. Platform review forms often want a demo video of the working flow, so build and test the connection in Recatch before applying. TikTok's production form does not keep a draft, so set things up in its sandbox first.
