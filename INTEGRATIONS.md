# Integrations log

Where each platform stands in Recatch. Last updated on 2026-10-12. Slack (own app and Add to Slack) and Bluesky are confirmed with real accounts. `main` is the only branch that matters.

"Direct" means Recatch talks to the platform's own API with our credentials. "Zernio" means it comes in through the Zernio hub (one API key, Zernio holds the platform approvals).

## Snapshot

Live on `recatch.app`: the app, the privacy, terms and data deletion pages, Connected apps (YouTube and TikTok sign-in, both tested for real), and Discord as a direct channel (a real bot was connected, a DM reached the inbox and the starter flow answered).

Waiting on someone else (nothing for us to do until they answer):

| What | Status | Waiting on |
| --- | --- | --- |
| Pinterest app, App ID 1621662 | Submitted 2026-10-09, "Trial access pending" | Pinterest's review |
| Meta developer account | Blocked with "Account confirmation needed" when we opened developers.facebook.com | A person finishing Meta's identity check in the Facebook tab |

Waiting on a person (we can't do these from the browser):

| What | Why |
| --- | --- |
| Demo video for Google (YouTube) verification | Needs a screen recording of the live flow |
| Demo video for the TikTok production review | Same |
| LinkedIn company Page | Needs a person to create it before any application |
| Company documents for Meta Business Verification and TikTok business verification | Business registration, proof of address and so on |

Small chores nobody has done yet:

| What | Why |
| --- | --- |
| Click Run health check on the Discord card (Setup page) | The card still says "Relay (Discord)". The bot was renamed to Recatch in Discord and the check refreshes the label. |
| Decide about "Public Bot" on the Discord Bot page | It is on, so anyone could add the test bot to their server. Turn it off unless that is wanted. |

Parked on purpose:

| What | Why |
| --- | --- |
| Reddit | The subreddit made for the application was auto-banned by Reddit's spam filter. |
| Branches `customer-accounts` and `origin-sync-canvas-media` on GitHub | Left for the team to decide. `main` already has newer versions of both. |

## Working

| Platform | How | Notes |
| --- | --- | --- |
| Telegram | Direct | Each customer connects their own bot with a BotFather token. Flows, buttons, media, `/` commands and phone share all work. |
| Bluesky | Direct | Confirmed with a real account on 2026-10-12: a DM reached the inbox with the sender's handle and the starter flow answered. Buttons arrive as a numbered list and typing a number moves the flow on (confirmed). One gotcha that cost a fix: sign-in goes through bsky.social, but chat calls must go to the account's own server (named in the sign-in response), because bsky.social answers them with Method Not Implemented. A person makes an app password in Bluesky (Settings, Privacy and security, App passwords) with "Allow access to your direct messages" ticked, then pastes the handle and the app password on the Setup page. Connecting refuses a password without DM access and says why. Bluesky doesn't push DMs, so the worker polls each account's chat log every 10 seconds (the cursor lives in the account's settings, and the first look only records where the log is, so old chats are never answered). Replies go out through the chat API. There are no buttons: they are sent as a numbered list and the flow engine matches a typed number or label, and links are made tappable. Like Discord, only one instance should run the worker. Bluesky's Zernio route still works as well, this is the direct one. |
| Slack, Add to Slack | Direct | Confirmed 2026-10-12 with a real install from the company Slack app. One Slack app owned by the company, installed by each customer's workspace with a button, no pasting. Create it at api.slack.com/apps with Create New App, From a manifest, and paste `slack-app-manifest.json` from the repo (it already has the scopes, the events URL `https://recatch.app/api/slack/events` for Event Subscriptions and Interactivity, the redirect URL, Messages tab on and Socket Mode off). Then put the app's Client ID, Client Secret and Signing Secret into Railway as `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET` (a person does that, never in chat). The Add to Slack button on the Setup page appears once all three are set. Events from every workspace come to the one URL and are matched to the account that installed the app there by workspace id. Slack's `app_uninstalled` and `tokens_revoked` mark the account as needing a reinstall, and disconnecting in Recatch revokes the token. Public distribution is switched on in the Slack app (no Marketplace listing needed). |
| Slack, own app | Direct | Confirmed with a real app on 2026-10-12: a DM reached the inbox, the starter flow answered with its buttons and a button tap worked. The fallback for someone who wants their own Slack app, and what we tested with. A person creates a Slack app, adds the bot scopes `chat:write`, `im:history`, `im:read`, `im:write` and `users:read`, installs it, and pastes the Bot User OAuth Token (xoxb-) and the Signing Secret on the Setup page. Recatch then shows one webhook URL, which goes into the app's Event Subscriptions (bot event `message.im`) and Interactivity pages. The Messages tab under App Home has to be on or people can't write to the app, and Socket Mode has to be off or Slack never calls the URL (the URL still shows Verified, which is misleading). Every request is checked against the signing secret. Direct messages and button taps work, typing indicators don't exist in Slack. This is a separate thing from the team alert webhook in Settings. |
| Discord | Direct | Confirmed with a real bot on 2026-10-09: a DM reached the inbox as a new contact and the starter flow answered with working buttons. A bot token connects it on the Setup page. Discord delivers DMs over a persistent websocket (the Gateway), so Recatch holds a live connection per bot, and only one running instance should hold it. People can only DM the bot if they share a server with it. |
| Instagram | Direct + Zernio | Direct adapter is built. Going direct on real accounts needs Meta App Review. |
| Messenger | Direct + Zernio | Same Meta adapter and same approval as Instagram. |
| WhatsApp | Direct + Zernio | Cloud API adapter is built. Needs the same Meta approval. |
| X, TikTok, Bluesky, Reddit, Slack, SMS, RCS, iMessage | Zernio | DMs and comments through Zernio only. |
| Threads, YouTube, LinkedIn | Zernio | Comments only. These platforms don't give DM access. |

Connected apps (live at `recatch.app/channels`): a signed-in business can connect a YouTube channel (Google sign-in) or a TikTok account. Recatch keeps the sign-in encrypted, refreshes it before it expires, shows "Needs reconnecting" if the provider refuses, and deletes it on disconnect. Anything that later calls these APIs (a feature, an agent tool) asks `getAccessToken` for a fresh token. These are sign-in and read-only connections, not messaging channels. Tested with fake servers, then for real: a YouTube channel and the TikTok sandbox account `ezzawan` both signed in through the live site. A provider's Connect button only turns on when its client keys are set in Railway.

Public `/privacy`, `/terms` and `/data-deletion` pages are live, linked from the site footer, with the contact address taken from `PUBLIC_CONTACT_EMAIL`. Every platform application asks for these. The text is a first draft and someone at the company should read it before we rely on it.

## Not done, and why

| Platform | Why |
| --- | --- |
| Meta (Instagram, Messenger, WhatsApp, Threads) direct | Code is ready. Needs the developer account confirmed, then a Meta app in development mode, then Business Verification and App Review. |
| Telegram, one bot for all of Recatch | Telegram has no company-wide API. The only way is Telegram Business, which needs every customer to pay for Telegram Premium. Dropped. |
| Reddit direct | API access form not sent (see Snapshot). |
| YouTube direct | Sign-in works. Verification (sensitive scope) and a quota increase are still to do. Comments only anyway, since YouTube has no DMs. |
| Pinterest direct | Waiting for Trial access, then a Standard access request. Its API covers pins and boards, not messages. There is no Pinterest connection in Recatch yet. |
| X direct | DMs need a paid API tier. |
| TikTok direct | Sandbox sign-in works. Production review still to do. DM access is limited to TikTok's business messaging partners, so this app is for login and posting only. |
| LinkedIn direct | Messaging is partner-program only, and they're selective. |
| iMessage direct | Apple only allows it through approved messaging providers. Zernio is the route. |
| Snapchat | No public DM API. |
| Google | Google shut down Business Messages in 2024. What's left handles reviews and posts, not chat. |
| WordPress, Shopify | Not messaging platforms. They'd be separate integrations (publishing, order lookups), not inbox channels. Not scoped yet. |

## Where things live

Everything is under the company admin account (`admin@hiiiiiiiiiii.com`), so the company owns the apps and not a personal login.

- **Domain:** `recatch.app` at Cloudflare, pointed at the Railway service. DNS records on the root: a CNAME to Railway, Railway's `_railway-verify` TXT, and TikTok's site verification TXT. They are "DNS only" (not proxied). Before turning the Cloudflare proxy on, set SSL/TLS to Full (strict) or Cloudflare and Railway can loop on redirects.
- **Railway:** project `relay`, one service deploying from `main`. `PUBLIC_URL` is `https://recatch.app`. Variables are set there and never in the repo: database, Redis, `ENCRYPTION_KEY`, `PUBLIC_CONTACT_EMAIL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`. `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET`. The old `relay-production-71da.up.railway.app` address still works.
- **Names:** the product is Recatch. The repo, the Railway project, the `relay_session` cookie, the `rly_` API key prefix and the `X-Relay-Signature` webhook header keep their old names on purpose, so nothing already deployed or integrated breaks.
- **Legal URLs to use on every application:** `https://recatch.app/privacy`, `https://recatch.app/terms`, `https://recatch.app/data-deletion`.
- **Google Cloud:** project `Recatch` (project id `relay-510909`, which cannot be renamed) in the company Workspace organization. YouTube Data API v3 is on. OAuth consent screen: app name Recatch, External, status Testing, links and authorized domain on `recatch.app`. The Google API Services User Data Policy was accepted on 2026-10-09. OAuth client "Recatch web" with redirect `https://recatch.app/api/connections/google/callback`. While in Testing, only listed test users can sign in (Audience, Test users).
- **Pinterest:** developer account carrying the company name Human Intelligence Studio Limited. App "Recatch by Human Intelligence Studio Limited", App ID 1621662, purpose "Consumer experience", use cases Pin creation and scheduling plus Reporting, audience Businesses, reads Pins and boards "Yes, mine". The purpose text says the integration is in development, which is true. Only one open request is allowed at a time, and Standard access can only be requested once Trial is granted.
- **TikTok for Developers:** organization `Human Intelligence Studio Limited`, which already had an old unfinished mini game app ("HI Studio Verification", left alone). New app "Recatch" (type Other), App ID 7694605918150952978. The domain `recatch.app` is verified. **The production form does not keep a half finished draft** (reloading wipes it), because review needs everything at once including the demo video. The working setup is the **sandbox** "Recatch sandbox", which does save: icon (the logo as a 1024 by 1024 PNG), category Business, description, terms and privacy URLs, Web platform, Login Kit with redirect `https://recatch.app/api/connections/tiktok/callback`, and the `user.info.basic` scope. Target user `ezzawan`. The sandbox has its own client key and secret, which are the ones in Railway. The production app has separate credentials.
- **Discord:** application "Recatch" in the Discord Developer Portal, application id 1557320195750629386, with the Recatch logo and a bot user named Recatch. Its bot token is shown only once (Reset Token on the Bot page) and is entered on the Setup page by a person. The test bot sits in "Human Intelligence Studio's server". Invite link: `https://discord.com/oauth2/authorize?client_id=1557320195750629386&scope=bot&permissions=0`. No privileged intents are needed for DMs. Other businesses connect their own bots the same way.
- **LinkedIn:** nothing created. Needs a company Page for HI Studio first.

## Start here next session

1. `git pull`, then `npm test` and `npx tsc --noEmit`. The test `broadcast A/B split` is slow (about 1 second alone) and can exceed vitest's 5 second limit when the whole suite runs in parallel. It passes alone, so rerun it by itself before assuming something broke.
2. Open the Facebook tab: Meta's identity check on the developer account is the first blocker, and only a person can finish it.
3. Railway builds take 5 to 6 minutes. After a push, check the change in a signed-in browser. A 401 from a signed-out request proves nothing, because `proxy.ts` returns it for any `/api` path.
4. The browser extension can drop its connection for a minute. Retry before assuming a page is broken.
5. Never read or enter secrets, passwords, CAPTCHAs or consent screens on someone's behalf. Those are done by a person.

## Resume checklist

In the order that unlocks the most:

1. **Meta.** Finish the identity check on the Facebook developer account. Then create the Meta app under the company's Business Manager. In dev mode the direct Instagram, Messenger and WhatsApp adapters already work with our own accounts as testers (WhatsApp gives a free test number). Record the screencast App Review wants, then do Business Verification with the company documents and App Review for `instagram_manage_messages`, `pages_messaging` and the WhatsApp permissions. Meta is the biggest win: it covers four networks.
2. **Run a health check on the Telegram bot** (Setup page) so its webhook moves to `recatch.app`.
3. **YouTube.** Record a short demo of the flow on `recatch.app` (Connect, Google consent, back on Channels showing the channel, Disconnect), then submit for verification and ask for a quota increase if needed.
4. **TikTok.** Record the same kind of demo for the sandbox sign-in. Then fill in the production form in one go (the same fields, Login Kit, a written explanation and the video) and use the production client key and secret. Business verification on the organization is a separate step that needs the company documents.
5. **Pinterest.** When Trial access arrives, build the Pinterest connection (sign-in, publish, read boards) so there is something to show, then request Standard access.
6. **LinkedIn.** Create the company Page, then apply to the Community Management API.
7. **Slack.** Done and confirmed: the company Slack app exists and Add to Slack works. Optional clean-up: delete the earlier personal test app, and re-check that a brand new contact now shows a name (the form-encoding fix is deployed). The Discord application "Recatch" (application id 1557320195750629386) is in the Developer Portal if more Discord work is needed. Its bot token is shown only once, via Reset Token.
8. **Bluesky.** Confirmed live. Left to do: a company Bluesky account instead of the test one, Bluesky OAuth sign-in to replace app passwords. Bluesky comments aren't handled (DMs only).
