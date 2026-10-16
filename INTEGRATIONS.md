# Integrations log

Where each platform stands in Recatch. Last updated on 2026-10-14. Zernio is used again for Instagram, Messenger and WhatsApp only (one company key, one profile per customer). Every other channel is direct. Four channels are confirmed with real accounts (Telegram, Slack, Discord, Bluesky) and three of them connect with one click through a company-owned app. `main` is the only branch that matters.

"Direct" means Recatch talks to the platform's own API with our credentials. There is no hub in between any more. The Channels page lists every channel in `src/lib/channels/catalog.ts` (live ones connect from Setup, the rest are greyed out as "On the way"), so update that file when a channel changes state.

## Snapshot

Live on `recatch.app`: the app, the privacy, terms and data deletion pages, Connected apps (YouTube and TikTok sign-in, both tested for real), email through Amazon SES (a reset email reached a Gmail inbox on 2026-10-14), and four direct channels, each tested end to end with a real account: Telegram, Slack, Discord and Bluesky. Slack (Add to Slack), Discord (Add to Discord) and Bluesky (Sign in with Bluesky) are one click for the customer, through an app the company owns. Telegram can't be, because it has no company-wide API.

Waiting on someone else (nothing for us to do until they answer):

| What | Status | Waiting on |
| --- | --- | --- |
| Pinterest app, App ID 1621662 | Submitted 2026-10-09, "Trial access pending" | Pinterest's review |
| TikTok production review (Login Kit, `user.info.basic`) | Submitted 2026-10-14 with the demo video. The organization's business verification is already done (verified 2026-10-13). | TikTok's review. When approved, a person puts the production client key and secret into Railway |
| YouTube (Google) verification of the `youtube.readonly` scope | Submitted 2026-10-14, "data access is under review". The home page domain was verified in Search Console first. | Google's review, which replies by email to the admin account |
| Meta developer account | Blocked with "Account confirmation needed" when we opened developers.facebook.com | A person finishing Meta's identity check in the Facebook tab |

Waiting on a person (we can't do these from the browser):

| What | Why |
| --- | --- |
| LinkedIn company Page | Needs a person to create it before any application |
| Company documents for Meta Business Verification | Business registration, proof of address and so on. TikTok already accepted the same documents. The business registration certificate on file expires 2026-12-16, so renew it before then |

Standing rule:

| What | Why |
| --- | --- |
| Keep "Public Bot" on in the Discord Bot page | Add to Discord needs it, so other servers can add the bot. |

Parked on purpose:

| What | Why |
| --- | --- |
| Reddit | The subreddit made for the application was auto-banned by Reddit's spam filter. |
| Branches `customer-accounts` and `origin-sync-canvas-media` on GitHub | Left for the team to decide. `main` already has newer versions of both. |

## Working

What a customer does to connect each channel. "One click" means a company-owned app and a button, with nothing pasted.

| Platform | How | Customer connects with | State |
| --- | --- | --- | --- |
| Telegram | Direct | A BotFather token. Telegram has no company-wide API, so this is as good as it gets. Flows, buttons, media, `/` commands and phone share all work. | Confirmed |
| Slack | Direct | **Add to Slack**, one click. Their own Slack app (token and signing secret) is the fallback. | Both confirmed with real installs |
| Discord | Direct | **Add to Discord**, one click, then members type `/chat` in the server. Their own bot token is the fallback. | Both confirmed with a real server and bot |
| Bluesky | Direct | **Sign in with Bluesky** (OAuth), one click. Handle plus app password is the fallback. | Both confirmed with a real account |
| Instagram, Messenger, WhatsApp | Through Zernio | **Sign in with Facebook**, one click. `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` are set in Railway. The direct adapters stay as the paste-your-own-token fallback. | Instagram connects for real in Zernio (`@danielphilipwatch`, 2026-10-14). Recatch saving it is fixed and deployed, waiting on a retry. DMs and comments not yet seen live |
| Threads, X, TikTok, Reddit, YouTube, LinkedIn, Pinterest, iMessage | None yet | Greyed out on the Channels page. See Not done, and why. | Not built |

Comment to DM, comment moderation and public comment replies run through Zernio, so they work for Instagram and Facebook once the Meta connection is live. On every other channel the comment triggers never fire.

### Company apps: how each one is switched on

These are set up once by a person under the company admin account. Secrets go into Railway by a person (see Where things live).

**Slack, Add to Slack.** One Slack app owned by the company, installed by each customer's workspace. Create it at api.slack.com/apps with Create New App, From a manifest, and paste `slack-app-manifest.json` from the repo (scopes, the events URL `https://recatch.app/api/slack/events` for Event Subscriptions and Interactivity, the redirect URL, Messages tab on, Socket Mode off). Turn on public distribution (Manage Distribution, no Marketplace listing needed). Variables: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`. Events from every workspace arrive at the one URL and are matched to the account that installed the app there by workspace id. `app_uninstalled` and `tokens_revoked` mark the account for a reinstall, and disconnecting in Recatch revokes the token. Gotchas that cost time: Socket Mode on means Slack never calls the URL even though the URL shows Verified, and Slack read methods like `users.info` only take form-encoded parameters (JSON is for `chat.*`), which is why names showed as user ids until it was fixed.

**Discord, Add to Discord.** One company bot (the "Recatch" application, id 1557320195750629386) that a customer adds to their server. A DM to a bot carries no server, so people start from the server: `/chat` (or `/chat topic:promo`, which starts that growth link). Recatch records which customer's server they came from (`discord_routes` table), messages them privately and answers with that customer's flows. If someone is in two customers' servers, the latest `/chat` decides who answers their DMs. A DM from someone who never ran `/chat` gets a one-line hint, at most once an hour. In the Developer Portal: OAuth2 redirect `https://recatch.app/api/discord/oauth/callback`, keep Public Bot on, and the bot token from Reset Token. Variables: `DISCORD_CLIENT_ID` (the application id), `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`. One Gateway connection serves every server, so only one instance may run the worker. Disconnecting in Recatch makes the bot leave the server (a failed leave shows a warning instead of failing silently). The server id comes from Discord's token response, never from the address the browser returned with. An account that pastes the shared bot's own token is refused, and an old account holding it is paused, because two connections would answer every DM twice. Discord asks for bot verification at 100 servers.

**Bluesky, Sign in with Bluesky.** Recatch is a confidential OAuth client, so it proves itself with a private key and a customer's session lasts months. The protocol (DPoP-bound tokens, pushed authorization requests, rotating refresh tokens) is Bluesky's `@atproto/oauth-client-node`, not hand-written. Recatch's client id is the address of its metadata file, `https://recatch.app/api/bluesky/client-metadata.json`, and the public key list is at `/api/bluesky/jwks.json` (a test checks it never contains the private half). Both must be reachable while signed out, and the proxy only matches whole path segments, so they are listed by their full names. Variable: `BLUESKY_OAUTH_KEY`, made once by `scripts/bluesky-keygen.mjs`. Rotating it signs every OAuth customer out. Sessions are encrypted in the `bluesky_oauth_store` table. Bluesky has no app review for OAuth clients. DMs need the scopes `transition:generic` and `transition:chat.bsky`, and `transition:generic` reads broadly on Bluesky's consent screen (manage the account's content). Recatch only reads DMs and replies, and the Setup page says so. A revoked session shows "Sign in with Bluesky again", and disconnecting signs out at Bluesky.

**Bluesky, the app password route (and how DMs work either way).** Bluesky doesn't push DMs, so the worker polls each account's chat log every 10 seconds. The cursor lives in the account's settings, and the first look only records where the log is, so old chats are never answered. Chat calls must go to the account's own server (named in the sign-in response), not bsky.social, which answers them with Method Not Implemented. There are no buttons: they go out as a numbered list and the flow engine matches a typed number or label. Links are made tappable. An app password needs "Allow access to your direct messages" ticked, and connecting refuses one without it. Only one instance should run the worker.

**Bluesky comments.** A reply under one of the account's own posts is a comment, so comment automations (keywords, post filter, once per person, AI public reply) work on Bluesky. The same poller reads `app.bsky.notification.listNotifications` (reason `reply`) every 10 seconds, and the time of the newest one seen lives in the account's settings as `blueskyRepliesSince`. The first look only records it, like the chat log. Replies in other people's threads are ignored. The public reply is a normal post in the thread. The rest of the flow goes out as a DM, but Bluesky only delivers that if the person accepts DMs from the account (by default only from accounts they follow). When it's refused the flow just stops. The post filter takes a bsky.app post link, with a handle or a DID. Comment moderation and "Hide the comment after replying" do nothing on Bluesky yet (it has a way to hide replies, through the post's threadgate, but that isn't built). Tested only against a fake Bluesky so far.

**Slack and Discord, the paste-your-own route.** Still there as a "Use my own app" link. Slack: bot scopes `chat:write`, `im:history`, `im:read`, `im:write`, `users:read`, the app's webhook URL (shown after connecting) in Event Subscriptions (`message.im`) and Interactivity. Discord: a bot token, one Gateway connection per bot. These are separate from the team alert webhook in Settings.

**Meta through Zernio.** Recatch holds one Zernio key (`ZERNIO_API_KEY`). Each Recatch user is one Zernio profile whose `externalId` is the user id, made on first connect, and their Instagram, Messenger and WhatsApp accounts live inside it. The Channels page buttons call `/api/zernio/connect`, Zernio runs Meta's consent screen and sends the browser to `/api/zernio/callback`, and the account list is read again from Zernio for that profile (nothing in the address is trusted). The user's "Meta" account (`bots.channel = zernio`, `settings.zernioManaged`) is created then, and its token is read from the environment, never stored. One webhook for everyone at `https://recatch.app/api/zernio/webhook`, signed with `ZERNIO_WEBHOOK_SECRET`, events `message.received`, `comment.received`, `referral.received`, `account.connected`, `account.disconnected`. It finds the customer from `profiles[].externalId`, `profile` or `account.profileId` (an object with `externalId`, or a bare id it looks up). Deleting a Meta account in Recatch disconnects its accounts and deletes the profile so billing stops. Zernio bills the company per connected account: first 2 free, then $6 each up to 10, $3 up to 100, $1 after, and messages past 10,000 a month ($1 per 10,000). The rate limit is shared by every customer. A billing lapse (402) hits everyone at once. Open questions: Zernio's terms on reselling were not readable (their /terms page 404s), and WhatsApp numbers are connected differently from Instagram and Page logins, so test that one separately. The key exists and both variables are in Railway. First real try on 2026-10-14: a member connected Instagram `@danielphilipwatch` from the admin login (`admin@hiiiiiiiiiii.com`, Zernio profile `6acfb2c78cfe240264bb2e52`). Zernio linked it every time, and Recatch showed "Instagram wasn't connected" every time. Three things were wrong, all fixed and deployed (last fix `f3dea85`, live at about 17:46 UTC):
- The callback only synced when the address carried `connected` and `accountId`. Zernio sends the platform but no `accountId`. It now always re-reads the account list from Zernio unless there is an `error`, and logs the parameter names when they're missing.
- The webhook only looked for the customer in `profiles[]`. It now also checks `profile` and `account.profileId`, and logs when it finds nobody.
- The real cause of the last failures: Zernio returns each account's `profileId` as an object (`{ _id, name, externalId }`), and `listZernioAccounts` compared it to a string, so every account was filtered out. The fake Zernio in the tests now answers with the object too.
Nobody had retried after the last deploy when this was written, so there is still no `zernio` row in `bots`.

**Email, Amazon SES.** Sends password reset links, a welcome email on signup, and an email to the account owner when the AI hands a chat to a person. Code is in `src/lib/email.ts` (SigV4 over fetch, no AWS SDK). Working since 2026-10-14: a password reset email from `hello@recatch.app` landed in a Gmail inbox, not spam. The `recatch.app` domain is verified in SES in `us-east-1` with Easy DKIM, a custom MAIL FROM domain `mail.recatch.app` (MX and SPF in Cloudflare) and a DMARC record (`p=none`). The SES account is out of the sandbox (50,000 a day) and is shared with the company's other projects (goose-bumps.uk, agent1tools.com, atlas-launch.com, go-phone.app), so their volume shows on the same dashboard. Bounces and complaints: the code is in (`src/lib/email-feedback.ts`, route `/api/email/feedback`). An address that hard-bounces or marks a mail as spam goes on the `email_suppressions` table and gets nothing more from Recatch. The one-time AWS setup was done on 2026-10-15 (a Standard SNS topic in `us-east-1`, subscription confirmed by Recatch). For reference, it is: an SNS topic in `us-east-1`, the recatch.app identity in SES pointing its Bounce and Complaint feedback at it, the topic's ARN in Railway as `AWS_SES_SNS_TOPIC_ARN`, and then an HTTPS subscription to `https://recatch.app/api/email/feedback` (Recatch confirms it by itself). Set the variable and let the deploy finish before subscribing, or the confirmation is refused and has to be requested again from the SNS console. The four variables (`AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `EMAIL_FROM`) are in Railway. Without all four, email is off and the forgot-password page says so.

Connected apps (live at `recatch.app/channels`): a signed-in business can connect a YouTube channel (Google sign-in) or a TikTok account. Recatch keeps the sign-in encrypted, refreshes it before it expires, shows "Needs reconnecting" if the provider refuses, and deletes it on disconnect. Anything that later calls these APIs (a feature, an agent tool) asks `getAccessToken` for a fresh token. These are sign-in and read-only connections, not messaging channels. Tested with fake servers, then for real: a YouTube channel and the TikTok sandbox account `ezzawan` both signed in through the live site. A provider's Connect button only turns on when its client keys are set in Railway.

Public `/privacy`, `/terms` and `/data-deletion` pages are live, linked from the site footer, with the contact address taken from `PUBLIC_CONTACT_EMAIL`. Every platform application asks for these. The text is a first draft and someone at the company should read it before we rely on it.

## Not done, and why

| Platform | Why |
| --- | --- |
| Meta (Instagram, Messenger, WhatsApp, Threads) direct | Code is ready. Needs the developer account confirmed, then a Meta app in development mode, then Business Verification and App Review. |
| Telegram, one bot for all of Recatch | Telegram has no company-wide API. The only way is Telegram Business, which needs every customer to pay for Telegram Premium. Dropped. |
| Reddit direct | API access form not sent (see Snapshot). |
| YouTube direct | Sign-in works. Verification of the sensitive scope was submitted on 2026-10-14 and is under review. A quota increase can be requested after it passes. Comments only anyway, since YouTube has no DMs. |
| Pinterest direct | Waiting for Trial access, then a Standard access request. Its API covers pins and boards, not messages. There is no Pinterest connection in Recatch yet. |
| X direct | DMs need a paid API tier. |
| TikTok direct | Sandbox sign-in works. The production review was submitted on 2026-10-14. Until it passes, only the sandbox target user (`ezzawan`) can sign in. DM access is limited to TikTok's business messaging partners, so this app is for login and posting only. |
| LinkedIn direct | Messaging is partner-program only, and they're selective. |
| iMessage direct | Apple only allows it through approved messaging providers. Nothing built. |
| Snapchat | No public DM API. |
| Google | Google shut down Business Messages in 2024. What's left handles reviews and posts, not chat. |
| WordPress, Shopify | Not messaging platforms. They'd be separate integrations (publishing, order lookups), not inbox channels. Not scoped yet. |

## Where things live

Everything is under the company admin account (`admin@hiiiiiiiiiii.com`), so the company owns the apps and not a personal login.

- **Domain:** `recatch.app` at Cloudflare, pointed at the Railway service. DNS records on the root: a CNAME to Railway, Railway's `_railway-verify` TXT, and TikTok's site verification TXT. They are "DNS only" (not proxied). Before turning the Cloudflare proxy on, set SSL/TLS to Full (strict) or Cloudflare and Railway can loop on redirects.
- **Railway:** project `recatch.app` (id `f59f9253-d69f-425f-8d00-698eb7b2a2f2`, environment production, shown as `relay` in older notes), one service named `recatch` deploying from `main`. `PUBLIC_URL` is `https://recatch.app`. Variables are set there and never in the repo. All of these are set: `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `WORKER_MODE`, `PUBLIC_CONTACT_EMAIL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN`, `BLUESKY_OAUTH_KEY`, and for Meta through Zernio `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET`. The old `relay-production-71da.up.railway.app` address still works. The `railway` CLI is logged in as the admin account. `railway deployment list --service recatch` shows whether a push went live, and `railway logs --build --service recatch <deployment id>` shows why a build failed. Secrets are written by a person: the Bluesky key was set on 2026-10-12 by piping `node scripts/bluesky-keygen.mjs | Select-Object -Last 1 | railway variable set BLUESKY_OAUTH_KEY --stdin --service recatch` in PowerShell, so it never appeared on screen. Claude's own permission settings block writes to a secret store, so ask the person to run it.
- **Names:** the product is Recatch. The repo, the Railway project, the `relay_session` cookie, the `rly_` API key prefix and the `X-Relay-Signature` webhook header keep their old names on purpose, so nothing already deployed or integrated breaks.
- **Legal URLs to use on every application:** `https://recatch.app/privacy`, `https://recatch.app/terms`, `https://recatch.app/data-deletion`.
- **Google Cloud:** project `Recatch` (project id `relay-510909`, which cannot be renamed) in the company Workspace organization. YouTube Data API v3 is on. OAuth consent screen: app name Recatch, External, status Testing, links and authorized domain on `recatch.app`. The Google API Services User Data Policy was accepted on 2026-10-09. OAuth client "Recatch web" with redirect `https://recatch.app/api/connections/google/callback`. While in Testing, only listed test users can sign in (Audience, Test users).
- **Pinterest:** developer account carrying the company name Human Intelligence Studio Limited. App "Recatch by Human Intelligence Studio Limited", App ID 1621662, purpose "Consumer experience", use cases Pin creation and scheduling plus Reporting, audience Businesses, reads Pins and boards "Yes, mine". The purpose text says the integration is in development, which is true. Only one open request is allowed at a time, and Standard access can only be requested once Trial is granted.
- **TikTok for Developers:** organization `Human Intelligence Studio Limited`, which already had an old unfinished mini game app ("HI Studio Verification", left alone). New app "Recatch" (type Other), App ID 7694605918150952978. The domain `recatch.app` is verified. **The production form does not keep a half finished draft** (reloading wipes it), because review needs everything at once including the demo video. The working setup is the **sandbox** "Recatch sandbox", which does save: icon (the logo as a 1024 by 1024 PNG), category Business, description, terms and privacy URLs, Web platform, Login Kit with redirect `https://recatch.app/api/connections/tiktok/callback`, and the `user.info.basic` scope. Target user `ezzawan`. The sandbox has its own client key and secret, which are the ones in Railway. The production app has separate credentials.
- **Discord:** application "Recatch" in the Discord Developer Portal, application id 1557320195750629386, with the Recatch logo and a bot user named Recatch. This is the shared bot behind Add to Discord. Its token is shown only once (Reset Token on the Bot page) and lives in Railway as `DISCORD_BOT_TOKEN`. The test server is "Human Intelligence Studio's server". No privileged intents are needed for DMs.
- **Slack:** the company app "Recatch" at api.slack.com/apps, created from `slack-app-manifest.json`, public distribution on. Its Client ID, Client Secret and Signing Secret are in Railway.
- **Bluesky:** no account with Bluesky is needed for the company app. Recatch's signing key is `BLUESKY_OAUTH_KEY` in Railway, and Bluesky reads the metadata and key list from `recatch.app`. The company Bluesky account is `@hiiiiiiiiiii2048.bsky.social`, on the company email. `@ezzawan.bsky.social` is a personal account used in testing.
- **LinkedIn:** nothing created. Needs a company Page for HI Studio first.

## Start here next session

**Pick up here (left on 2026-10-15):**
- [x] Instagram through Zernio: connect saves in Recatch and the Channels page lists `@danielphilipwatch`. Confirmed 2026-10-15.
- [x] Instagram DM and comment land in Live Chat. Confirmed 2026-10-15.
- [ ] Connect a WhatsApp number through Zernio, separately. It connects differently from Instagram.
- [x] Email bounces: SNS topic, SES feedback, `AWS_SES_SNS_TOPIC_ARN` and the HTTPS subscription are all set up, and Recatch confirmed the subscription on 2026-10-15. Still worth one simulated hard bounce to `bounce@simulator.amazonses.com` to see a row land in `email_suppressions`.
- [ ] Bluesky comments, live test: set up a comment automation on a post by `@hiiiiiiiiiii2048.bsky.social` (signed in as `lilrannee@gmail.com`, which owns that account), reply from `@ezzawan.bsky.social`, and check the public reply in the thread and the DM. Both accounts already poll notifications without errors.

1. `git pull`, then `npm test` and `npx tsc --noEmit`. Vitest allows 20 seconds per test and 30 for setup, because the integration suites load large libraries and start a database when many run at once. If one still times out, rerun it by itself before assuming something broke.
2. Open the Facebook tab: Meta's identity check on the developer account is the first blocker, and only a person can finish it.
3. Railway builds take 5 to 6 minutes, and the old build serves until then. On 2026-10-14 a member retried the Instagram connect two minutes after a push and hit the old code, which looked like the fix had failed. Tell people to wait for SUCCESS in `railway deployment list`. After a push, check the change in a signed-in browser. A 401 from a signed-out request proves nothing, because `proxy.ts` returns it for any `/api` path.
4. The browser extension can drop its connection for a minute. Retry before assuming a page is broken.
5. Never read or enter secrets, passwords, CAPTCHAs or consent screens on someone's behalf. Those are done by a person.
6. The person works on Windows. Any command you ask them to run must be for PowerShell (say so, and say the folder), never bash or Unix-only tools.
7. To see what actually happened live: `railway logs --service recatch --http --since 1h` lists every request with its status and timing (the app itself does not log requests). To see what Zernio holds, query `/v1/profiles` and `/v1/accounts?profileId=` from inside the container with `railway ssh --service recatch -- node -e "..."`, reading the key from `process.env`, so it never prints.
8. After every push, run `railway deployment list --service recatch`. A failed build leaves the old one serving, and three failed deploys in a row once went unnoticed because the signed-out 401 looked the same. The usual cause is the lock file (see CLAUDE.md).

## Resume checklist

In the order that unlocks the most:

0. **Email.** Done on 2026-10-14, see Email, Amazon SES. Bounce and complaint handling is built and wired to AWS since 2026-10-15. Later: move DMARC from `p=none` to `p=quarantine` after a few weeks of clean reports.
0b. **Meta through Zernio.** Instagram confirmed live on 2026-10-15 (connect, DMs and comments). Next is WhatsApp, which connects differently. Read Zernio's terms on reselling.
1. **Meta, direct.** Finish the identity check on the Facebook developer account. Then create the Meta app under the company's Business Manager. In dev mode the direct Instagram, Messenger and WhatsApp adapters already work with our own accounts as testers (WhatsApp gives a free test number). Record the screencast App Review wants, then do Business Verification with the company documents and App Review for `instagram_manage_messages`, `pages_messaging` and the WhatsApp permissions. Meta is the biggest win: it covers four networks.
2. **Telegram webhook.** Done on 2026-10-14: a health check moved `@relay_hi_bot` to `https://recatch.app/api/telegram/webhook/...`.
3. **YouTube.** Submitted for verification on 2026-10-14. Wait for Google's email to admin@hiiiiiiiiiii.com and answer anything it asks. Ask for a quota increase after it passes, if needed.
4. **TikTok.** Submitted for production review on 2026-10-14, and business verification is done. When approved, set the production `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` in Railway (a person does this with a piped command), then sign in once with a non-sandbox account to confirm. Do not swap the keys before approval, because the sandbox keys are the ones that work today.
5. **Pinterest.** When Trial access arrives, build the Pinterest connection (sign-in, publish, read boards) so there is something to show, then request Standard access.
6. **LinkedIn.** Create the company Page, then apply to the Community Management API.
7. **Slack, Discord, Bluesky.** Done and confirmed with real accounts, all three one click. Clean-up finished on 2026-10-14: the old "Relay (Discord)" account is disconnected, the personal Slack test app is deleted, a brand new Slack contact shows their name, and the company Bluesky account exists.
8. **Meta, one click.** When Meta is unblocked, aim for the same shape as Slack: one Recatch Meta app with Facebook Login so customers click instead of pasting a Page token. The Setup page's token form stays as the fallback.
9. **Security.** Next.js went to 16.4.0 and `npm audit fix` cleared the rest on 2026-10-14. The one advisory left in production deps is `braces`, pulled in by the shadcn CLI. Nothing upstream fixes it yet, and the app only uses shadcn for a CSS import at build time, so no request ever reaches it. Check again when shadcn ships a new release.
10. **Bluesky comments.** Built on 2026-10-14, see Bluesky comments. Next: try it with the company account (post, reply from `@ezzawan.bsky.social`, check the public reply and the DM), then think about hiding replies through the threadgate.
