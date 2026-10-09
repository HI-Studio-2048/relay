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

- Google Cloud project `Recatch` (project id `relay-510909`, which cannot be renamed) in the company Workspace organization. YouTube Data API v3 is enabled. The OAuth consent screen is set up: app name Recatch, External audience, status Testing, home page, privacy and terms links on `recatch.app`, `recatch.app` as the authorized domain, and the admin address as support and developer contact. The Google API Services User Data Policy was accepted on 2026-10-09. No OAuth client yet.
- Pinterest developer account signed in (the account carries the company name Human Intelligence Studio Limited). The "Connect app" form was submitted on 2026-10-09 (a person ticked the reCAPTCHA). App ID 1621662, status "Trial access pending", waiting on Pinterest's review. Only one open request is allowed at a time, and a Standard access upgrade can only be requested once Trial is granted. What was submitted: app name "Recatch by Human Intelligence Studio Limited", website and privacy link on `recatch.app`, purpose "Consumer experience", use cases Pin creation and scheduling plus Reporting, audience Businesses, reads Pins and boards: Yes, mine (the connected account's own content only). The purpose text says the integration is in development. Pinterest's API has no messaging, so this is for publishing and reporting only. New apps start on Trial access (1,000 calls a day), then need a Standard access request.
- TikTok for Developers: an organization `Human Intelligence Studio Limited` already existed, with an old unfinished mini game app ("HI Studio Verification", business verification 0 of 8). Left alone. On 2026-10-09 a new app "Recatch" (type Other, so Login Kit, Share Kit and Content Posting API are possible) was created under the organization as a draft, App ID 7694605918150952978. The domain `recatch.app` is verified with TikTok through a TXT record on the root domain, so the terms, privacy and website URLs pass. Draft saved with category Business, description, those three URLs and the Web platform. Not submitted: app review needs an app icon (1024 by 1024), at least one product and its scopes, a written explanation, and a demo video of the full working TikTok flow recorded in TikTok's sandbox. That can only be recorded once Recatch has a TikTok connection.
- LinkedIn: no account yet. Needs a company Page for HI Studio first.

## Next up

1. **Run a health check on the Telegram bot** (Setup page) so its webhook moves to `recatch.app`. The old Railway address still works until then.
2. **Google OAuth client, once YouTube is built.** Recatch has no direct YouTube connection yet, only comments through Zernio. The client ID needs a redirect URL that a Google sign-in flow in the app answers, so build that first. Then create the client, add the YouTube scopes under Data Access, and go for verification with a demo video, plus a quota increase if needed.
3. **Pinterest: wait for Trial access.** Submitted, App ID 1621662. When Pinterest approves it, build the Pinterest connection (sign-in, publish, read boards) so there is something to show, then request Standard access.
4. **TikTok: build the connection, then submit.** The draft app is ready. TikTok review needs a demo video of a working flow, so build the sign-in with TikTok and the first product (Login Kit, plus Content Posting API if wanted) against the sandbox, record it, add the icon, and submit. TikTok has no public DM API for companies like this one (DM access is limited to its business messaging partners), so this app is for login and posting only. Business verification on the organization is a separate step that needs the company documents.
5. **LinkedIn.** Create the company Page, then apply to the Community Management API.
6. **Meta in development mode.** Create the Meta app under the company's Business Manager. In dev mode the direct Instagram, Messenger and WhatsApp adapters already work with our own accounts as testers (WhatsApp gives a free test number). Record the screencast App Review wants.
7. **Meta applications.** Business Verification with the company docs, then App Review for `instagram_manage_messages`, `pages_messaging` and the WhatsApp permissions.
8. **Discord and Slack adapters.** No approval needed, so this is code work that can happen now. Slack pushes events to a URL, like Telegram. Discord delivers DMs over a persistent websocket (the Gateway), so Recatch has to hold a live connection per bot.
9. **Bluesky adapter.** Also instant, but needs a polling job because Bluesky doesn't push DMs.
