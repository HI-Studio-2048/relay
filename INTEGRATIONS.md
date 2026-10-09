# Integrations log

Where each platform stands in Relay, as of 2026-10-09.

"Direct" means Relay talks to the platform's own API with our credentials. "Zernio" means it comes in through the Zernio hub (one API key, Zernio holds the platform approvals).

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
| Telegram, one bot for all of Relay | Telegram has no company-wide API. The only way is Telegram Business, which needs every customer to pay for Telegram Premium. Dropped. |
| Bluesky direct | No adapter yet. Keys are instant. Bluesky doesn't push DMs, so Relay would have to poll for them. |
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

## Next up

1. **Put the legal pages live.** Set `PUBLIC_CONTACT_EMAIL` on Railway, push, and check `/privacy`, `/terms` and `/data-deletion` load on the production domain. Get the wording signed off.
2. **Meta in development mode.** Create the Meta app under the company's Business Manager. In dev mode the direct Instagram, Messenger and WhatsApp adapters already work with our own accounts added as testers (WhatsApp gives a free test number). Prove it works and record the screencast App Review wants.
3. **Meta applications.** Submit Business Verification with the company docs, then App Review for `instagram_manage_messages`, `pages_messaging` and the WhatsApp permissions. Use the legal page URLs from step 1.
4. **The other applications, in parallel.** Google (YouTube), Pinterest, TikTok and LinkedIn. Same company docs, same legal URLs. They take weeks, so start them together.
5. **Discord and Slack adapters.** No approval needed, so this is pure code work while the applications wait. Both push events to us, same shape as Telegram.
6. **Bluesky adapter.** Also instant, but needs a polling job because Bluesky doesn't push DMs.
