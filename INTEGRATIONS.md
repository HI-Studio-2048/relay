# Integrations log

Where each platform stands in Recatch, as of 2026-10-09.

"Direct" means Recatch talks to the platform's own API with our credentials. "Zernio" means it comes in through the Zernio hub (one API key, Zernio holds the platform approvals).

## Working

| Platform | How | Notes |
| --- | --- | --- |
| Telegram | Direct | Each customer connects their own bot with a BotFather token. Flows, buttons, media, `/` commands and phone share all work. |
| Instagram | Direct + Zernio | Direct adapter is built. Going direct on real accounts needs Meta App Review (see below). |
| Messenger | Direct + Zernio | Same Meta adapter and same approval as Instagram. |
| WhatsApp | Direct + Zernio | Cloud API adapter is built. Needs the same Meta approval. |
| X, TikTok, Bluesky, Reddit, Slack, SMS, RCS, iMessage | Zernio | DMs and comments through Zernio only. |
| Threads, YouTube, LinkedIn | Zernio | Comments only. These platforms don't give DM access. |

Connected apps (built and deployed 2026-10-09, at `recatch.app/channels`): a signed-in business can connect a YouTube channel (Google sign-in) or a TikTok account to Recatch from the Channels page. Recatch keeps the sign-in encrypted, refreshes it before it expires, shows "Needs reconnecting" if the provider refuses, and deletes it on disconnect. Anything that later calls these APIs (a feature, an agent tool) asks `getAccessToken` for a fresh token. These are sign-in and read-only connections, not messaging channels. Tested with fake Google and TikTok servers, not yet with the real ones. Each needs its client keys in Railway before the Connect button turns on.

Also shipped today: the Channels page (connect networks in one click through Zernio) and customer accounts with sign-up, log-in and a public landing page.

Public `/privacy`, `/terms` and `/data-deletion` pages are in, linked from the site footer. Every platform application below asks for a privacy policy URL, and Meta also wants a data deletion URL, so these come first. The contact address on them comes from `PUBLIC_CONTACT_EMAIL`. The text is a first draft and someone at the company should read it before we submit anything.

## Not done, and why

| Platform | Why |
| --- | --- |
| Meta (Instagram, Messenger, WhatsApp, Threads) direct | Code is ready. Waiting on Meta Business Verification and App Review, and the status of both is unknown. |
| Telegram, one bot for all of Recatch | Telegram has no company-wide API. The only way is Telegram Business, which needs every customer to pay for Telegram Premium. Dropped. |
| Bluesky direct | No adapter yet. Keys are instant. Bluesky doesn't push DMs, so Recatch would have to poll for them. |
| Discord direct | No adapter yet. Keys are instant. Discord is only used for team alerts right now. |
| Slack direct | No adapter yet. Keys are instant. Slack is only used for team alerts right now. |
| Reddit direct | API access form not sent. The subreddit we made for it got auto-banned by Reddit's spam filter, so it's parked. |
| YouTube direct | Needs Google OAuth verification and a quota increase. Comments only anyway, since YouTube has no DMs. |
| Pinterest direct | Needs a review for Standard access. Its API covers pins and boards, not messages. |
| X direct | DMs need a paid API tier. |
| TikTok direct | DM access is limited to TikTok's business messaging partners. |
| LinkedIn direct | Messaging is partner-program only, and they're selective. |
| iMessage direct | Apple only allows it through approved messaging providers. Zernio is the route. |
| Snapchat | No public DM API. |
| Google | Google shut down Business Messages in 2024. What's left handles reviews and posts, not chat. |
| WordPress, Shopify | Not messaging platforms. They'd be separate integrations (publishing, order lookups), not inbox channels. Not scoped yet. |

## Domain

The Google, Pinterest, TikTok, LinkedIn and Meta applications all ask for a website, privacy and terms URL on a domain the company owns, and they tie the approval to it. The domain is `recatch.app` (Cloudflare, pointed at the Railway service, `PUBLIC_URL` set to it). The product is renamed from Relay to Recatch in the app and docs. The repo, the Railway project, the `relay_session` cookie, the `rly_` API key prefix and the `X-Relay-Signature` webhook header keep their old names on purpose, so nothing already deployed or integrated breaks.

Use these URLs on every application: `https://recatch.app/privacy`, `https://recatch.app/terms` and `https://recatch.app/data-deletion`.

Done so far, under the admin account (`admin@hiiiiiiiiiii.com`, so the company owns the apps and not a personal login):

- Google Cloud project `Recatch` (project id `relay-510909`, which cannot be renamed) in the company Workspace organization. YouTube Data API v3 is enabled. The OAuth consent screen is set up: app name Recatch, External audience, status Testing, home page, privacy and terms links on `recatch.app`, `recatch.app` as the authorized domain, and the admin address as support and developer contact. The Google API Services User Data Policy was accepted on 2026-10-09. OAuth client "Recatch web" (Web application) created on 2026-10-09 with redirect URL `https://recatch.app/api/connections/google/callback`, and its ID and secret are set in Railway, so the YouTube Connect button is on at `recatch.app/channels`. While the app is in Testing, only listed test users can sign in (Audience, Test users).
- Pinterest developer account signed in (the account carries the company name Human Intelligence Studio Limited). The "Connect app" form was submitted on 2026-10-09 (a person ticked the reCAPTCHA). App ID 1621662, status "Trial access pending", waiting on Pinterest's review. Only one open request is allowed at a time, and a Standard access upgrade can only be requested once Trial is granted. What was submitted: app name "Recatch by Human Intelligence Studio Limited", website and privacy link on `recatch.app`, purpose "Consumer experience", use cases Pin creation and scheduling plus Reporting, audience Businesses, reads Pins and boards: Yes, mine (the connected account's own content only). The purpose text says the integration is in development. Pinterest's API has no messaging, so this is for publishing and reporting only. New apps start on Trial access (1,000 calls a day), then need a Standard access request.
- TikTok for Developers: an organization `Human Intelligence Studio Limited` already existed, with an old unfinished mini game app ("HI Studio Verification"). Left alone. On 2026-10-09 a new app "Recatch" (type Other, so Login Kit, Share Kit and the Content Posting API are possible) was created under it, App ID 7694605918150952978. The domain `recatch.app` is verified with TikTok through a TXT record on the root domain. The production form does not keep a half finished draft (reloading wipes it), because review needs everything at once, including a demo video. So the working setup lives in the **sandbox** "Recatch sandbox", which does save: icon (the logo as a 1024 by 1024 PNG), category Business, description, terms and privacy URLs, the Web platform, Login Kit with the redirect URL `https://recatch.app/api/connections/tiktok/callback`, and the `user.info.basic` scope. The sandbox has its own client key and secret. Still to do there: add a target user (a TikTok account allowed to try it).
- LinkedIn: no account yet. Needs a company Page for HI Studio first.

## Next up

1. **Run a health check on the Telegram bot** (Setup page) so its webhook moves to `recatch.app`. The old Railway address still works until then.
2. **Try the YouTube sign-in for real.** It is live and the Google client and keys are set. Add a test user under Audience in the Google Auth Platform, add the `youtube.readonly` scope under Data Access, click Connect on YouTube and sign in. Expect Google's "unverified app" warning while the app is in Testing. Once it works, record the demo video and go for verification (that scope is sensitive), plus a quota increase if needed.
3. **Pinterest: wait for Trial access.** Submitted, App ID 1621662. When Pinterest approves it, build the Pinterest connection (sign-in, publish, read boards) so there is something to show, then request Standard access.
4. **TikTok: finish the sandbox, test it, record the demo, then submit production.** Add a target user under Sandbox settings (the TikTok account that will sign in). Put the sandbox client key and secret in Railway as `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` and try Connect on TikTok at `recatch.app/channels`. Then record the demo video of that flow. For the real review, fill in the production form in one go (the same fields, Login Kit, the explanation and the video) and use the production client key and secret. TikTok has no public DM API for companies like this one (DM access is limited to its business messaging partners), so this app is for login and posting only. Business verification on the organization is a separate step that needs the company documents.
5. **LinkedIn.** Create the company Page, then apply to the Community Management API.
6. **Meta in development mode.** Create the Meta app under the company's Business Manager. In dev mode the direct Instagram, Messenger and WhatsApp adapters already work with our own accounts as testers (WhatsApp gives a free test number). Record the screencast App Review wants.
7. **Meta applications.** Business Verification with the company docs, then App Review for `instagram_manage_messages`, `pages_messaging` and the WhatsApp permissions.
8. **Discord and Slack adapters.** No approval needed, so this is code work that can happen now. Slack pushes events to a URL, like Telegram. Discord delivers DMs over a persistent websocket (the Gateway), so Recatch has to hold a live connection per bot.
9. **Bluesky adapter.** Also instant, but needs a polling job because Bluesky doesn't push DMs.
