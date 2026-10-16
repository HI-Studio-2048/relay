"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNELS, CHANNEL_IDS, type ChannelId } from "@/lib/channels/types";
import { api } from "@/lib/client";
import { BotFieldsCard } from "@/components/bot-fields-card";
import { TeamCard } from "@/components/team-card";
import { AlertsCard } from "@/components/alerts-card";
import { StripeCard } from "@/components/stripe-card";
import { FieldsCard } from "@/components/fields-card";
import { TagsCard } from "@/components/tags-card";
import { ActivityCard } from "@/components/activity-card";

const GUIDES: Record<ChannelId, { title: string; steps: string[]; tokenLabel: string; accountLabel?: string }> = {
  // Never offered in the picker: Meta accounts are added from the Channels page.
  zernio: { title: "Instagram, Messenger and WhatsApp", tokenLabel: "", steps: ["Connect these from the Channels page."] },
  youtube: { title: "YouTube comments", tokenLabel: "", steps: ["Connect YouTube with Sign in with Google on the Channels page."] },
  telegram: {
    title: "Telegram bot",
    tokenLabel: "Bot token",
    steps: [
      "Talk to @BotFather, create a bot, copy the token.",
      "Recatch calls getMe, stores the token encrypted, and sets the webhook for you.",
    ],
  },
  instagram: {
    title: "Instagram (via a Facebook Page)",
    tokenLabel: "Page access token",
    accountLabel: "Facebook Page ID",
    steps: [
      "In Meta for Developers, add Instagram to your app and connect the Instagram professional account to a Facebook Page.",
      "Generate a Page access token with instagram_manage_messages and pages_messaging, then paste it with the Page ID.",
      "After connecting, paste the webhook URL and verify token below into the app's Instagram webhooks (subscribe to messages, messaging_postbacks).",
    ],
  },
  messenger: {
    title: "Facebook Messenger",
    tokenLabel: "Page access token",
    accountLabel: "Facebook Page ID",
    steps: [
      "In Meta for Developers, add Messenger to your app and generate a Page access token with pages_messaging.",
      "After connecting, paste the webhook URL and verify token below into Messenger webhooks (subscribe to messages, messaging_postbacks, messaging_referrals).",
    ],
  },
  whatsapp: {
    title: "WhatsApp Business (Cloud API)",
    tokenLabel: "Permanent access token",
    accountLabel: "Phone number ID",
    steps: [
      "In Meta for Developers, add WhatsApp to your app and create a system-user token with whatsapp_business_messaging.",
      "Copy the Phone number ID from WhatsApp → API Setup.",
      "After connecting, paste the webhook URL and verify token below into WhatsApp webhooks (subscribe to messages).",
    ],
  },
  discord: {
    title: "Discord bot",
    tokenLabel: "Bot token",
    steps: [
      "In the Discord Developer Portal, create an application, open Bot, and copy the token.",
      "People message the bot in a DM, so they need a server in common with it. Invite it with the bot scope from OAuth2 → URL Generator.",
      "Recatch holds a live connection to Discord with the token. No webhook or public URL is needed.",
    ],
  },
  bluesky: {
    title: "Bluesky account",
    tokenLabel: "App password",
    accountLabel: "Bluesky handle",
    steps: [
      "In Bluesky open Settings, then Privacy and security, then App passwords, and add one. Tick 'Allow access to your direct messages' or Recatch cannot read them. Never use your main password.",
      "Paste the handle (like name.bsky.social) and the app password here.",
      "Bluesky does not push messages, so Recatch checks for new ones every few seconds. Buttons go out as a numbered list and people answer by typing the number. Only messages that arrive after you connect are answered.",
    ],
  },
  slack: {
    title: "Slack app",
    tokenLabel: "Bot User OAuth Token",
    steps: [
      "At api.slack.com/apps create an app. Under OAuth & Permissions add the bot scopes chat:write, im:history, im:read, im:write and users:read, then install it to your workspace and copy the Bot User OAuth Token (xoxb-).",
      "Copy the Signing Secret from Basic Information and paste it below. Recatch uses it to check that events really come from Slack.",
      "After connecting, paste the webhook URL below into Event Subscriptions (subscribe to the bot event message.im) and into Interactivity & Shortcuts. Under App Home, turn on the Messages tab so people can write to the app. Leave Socket Mode off, or Slack sends events over a websocket and never calls the URL.",
    ],
  },
};

export default function SetupPage() {
  const { bot, bots, refresh, setBotId } = useBot();
  const [channel, setChannel] = useState<ChannelId>("telegram");
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [installs, setInstalls] = useState({ slack: false, discord: false, bluesky: false });
  const [bskyHandle, setBskyHandle] = useState("");
  const [manualInstall, setManualInstall] = useState(false);
  const guide = GUIDES[channel];
  const oneClick =
    manualInstall
      ? null
      : channel === "slack" && installs.slack
        ? {
            href: "/api/slack/install",
            label: "Add to Slack",
            own: "Use my own Slack app instead",
            blurb: "Add Recatch to your Slack workspace and approve it. People then message Recatch in Slack and your flows answer.",
          }
        : channel === "discord" && installs.discord
          ? {
              href: "/api/discord/install",
              label: "Add to Discord",
              own: "Use my own Discord bot instead",
              blurb: "Add Recatch to your Discord server and approve it. Members type /chat in the server and Recatch starts a private conversation with them, answered by your flows.",
            }
          : channel === "bluesky" && installs.bluesky
            ? {
                href: `/api/bluesky/install${bskyHandle.trim() ? `?handle=${encodeURIComponent(bskyHandle.trim())}` : ""}`,
                label: "Sign in with Bluesky",
                own: "Use an app password instead",
                blurb:
                  "Sign in on Bluesky and approve Recatch. Bluesky words the permission broadly, as access to manage the account's content, because that is how it offers direct messages. Recatch only reads your direct messages and replies to them, and never posts.",
                field: true,
              }
            : null;

  useEffect(() => {
    api<{ slackInstall: boolean; discordInstall: boolean; blueskyOauth: boolean }>("/api/channels/capabilities")
      .then((data) => setInstalls({ slack: data.slackInstall, discord: data.discordInstall, bluesky: data.blueskyOauth }))
      .catch(() => undefined);
    // Add to Slack comes back here with the result in the address.
    const query = new URLSearchParams(window.location.search);
    // The Channels page links here with the channel already chosen.
    const wanted = query.get("channel");
    if (wanted && (CHANNEL_IDS as string[]).includes(wanted)) queueMicrotask(() => setChannel(wanted as ChannelId));
    const connected = query.get("connected");
    const failed = query.get("error");
    if (connected || failed) {
      if (connected) toast.success(connected);
      else toast.error(failed ?? "");
      window.history.replaceState(null, "", window.location.pathname);
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isDiscord = channel === "discord";
  const isSlack = channel === "slack";
  const isBluesky = channel === "bluesky";
  const isMeta = channel !== "telegram" && !isDiscord && !isSlack && !isBluesky;

  const connect = async () => {
    setBusy(true);
    try {
      const data = await api<{ bot: { id: string; name: string } }>("/api/bots", {
        method: "POST",
        body: JSON.stringify({ channel, token, externalAccountId: accountId, appSecret }),
      });
      setBotId(data.bot.id);
      setToken("");
      setAppSecret("");
      await refresh();
      toast.success(`Connected ${data.bot.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  };

  const health = async () => {
    if (!bot) return;
    setBusy(true);
    try {
      await api(`/api/bots/${bot.id}/health`, { method: "POST" });
      await refresh();
      toast.success("Health check complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!bot) return;
    if (!window.confirm("Disconnect this account and delete its contacts, flows, and messages?")) return;
    setBusy(true);
    try {
      const done = await api<{ warning?: string }>(`/api/bots/${bot.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      await refresh();
      if (done.warning) toast.warning(done.warning, { duration: 12000 });
      else toast.success("Account removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Channels</h1>
        <p className="text-sm text-muted-foreground">
          Connect Telegram, Slack, Discord, Bluesky, Instagram, Messenger or WhatsApp. Each connection gets its own inbox, contacts, and flows; switch between them in the sidebar.
          Keys are encrypted at rest and never written to logs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connect a channel</CardTitle>
          <CardDescription>Pick the platform, then paste the credentials from its developer console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CHANNEL_IDS.filter((id) => id !== "zernio" && id !== "youtube").map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === channel) return;
                  // What was typed for one platform must never be sent to another.
                  setToken("");
                  setAccountId("");
                  setAppSecret("");
                  setManualInstall(false);
                  setChannel(id);
                }}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: channel === id ? CHANNELS[id].color : undefined,
                  boxShadow: channel === id ? `0 0 0 2px ${CHANNELS[id].color}33` : undefined,
                }}
              >
                <span className="inline-block size-2.5 rounded-full" style={{ background: CHANNELS[id].color }} />
                {CHANNELS[id].label}
              </button>
            ))}
          </div>

          {oneClick ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{oneClick.blurb}</p>
              {"field" in oneClick && oneClick.field ? (
                <Input
                  autoComplete="off"
                  placeholder="Your handle, like name.bsky.social (optional)"
                  value={bskyHandle}
                  onChange={(event) => setBskyHandle(event.target.value)}
                  aria-label="Bluesky handle"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button nativeButton={false} render={<a href={oneClick.href} />}>
                  {oneClick.label}
                </Button>
                <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setManualInstall(true)}>
                  {oneClick.own}
                </button>
              </div>
            </div>
          ) : null}

          <div className={oneClick ? "hidden" : "space-y-4"}>
          <div className="space-y-1">
            <p className="text-sm font-medium">{guide.title}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {isMeta || isBluesky ? (
            <div className="space-y-2">
              <Label htmlFor="account">{guide.accountLabel}</Label>
              <Input
                id="account"
                autoComplete="off"
                placeholder={channel === "whatsapp" ? "1234567890123456" : isBluesky ? "name.bsky.social" : "Page ID"}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="token">{guide.tokenLabel}</Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              placeholder={isMeta ? "EAAG…" : isDiscord ? "MTIz…" : isSlack ? "xoxb-…" : isBluesky ? "xxxx-xxxx-xxxx-xxxx" : "123456:ABC…"}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          {isMeta || isSlack ? (
            <div className="space-y-2">
              <Label htmlFor="secret">{isSlack ? "Signing secret" : "App secret (recommended)"}</Label>
              <Input
                id="secret"
                type="password"
                autoComplete="off"
                placeholder={isSlack ? "From Basic Information in the Slack app" : "Used to verify webhook signatures"}
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
              />
            </div>
          ) : null}
          <Button onClick={() => void connect()} disabled={busy || !token.trim() || (isMeta && !accountId.trim()) || (isSlack && !appSecret.trim()) || (isBluesky && !accountId.trim())}>
            {busy ? "Connecting…" : isMeta ? "Connect account" : isDiscord ? "Connect bot" : isSlack ? "Connect app" : isBluesky ? "Connect account" : "Connect and set webhook"}
          </Button>
          </div>
        </CardContent>
      </Card>

      {bot ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full" style={{ background: CHANNELS[bot.channel].color }} />
              {bot.name}
            </CardTitle>
            <CardDescription>
              {CHANNELS[bot.channel].label} · status {bot.status}
              {bot.webhookUrl || bot.channel === "discord" || bot.channel === "bluesky" || bot.channel === "slack" ? "" : " · PUBLIC_URL missing, webhook not set"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bot.channel === "slack" && bot.webhookUrl ? (
              <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">Paste into the Slack app</p>
                <p className="break-all">
                  <span className="text-muted-foreground">Request URL (Event Subscriptions and Interactivity):</span> {bot.webhookUrl}
                </p>
              </div>
            ) : bot.channel !== "telegram" && bot.webhookUrl ? (
              <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">Paste into the Meta App dashboard</p>
                <p className="break-all">
                  <span className="text-muted-foreground">Callback URL:</span> {bot.webhookUrl}
                </p>
                <p>
                  <span className="text-muted-foreground">Verify token:</span> {bot.verifyToken}
                </p>
                {!bot.hasAppSecret ? (
                  <p className="text-xs text-amber-600">No app secret stored — webhook signatures are not verified yet.</p>
                ) : null}
              </div>
            ) : bot.webhookUrl ? (
              <p className="break-all text-sm text-muted-foreground">Webhook: {bot.webhookUrl}</p>
            ) : null}
            {bot.discordShared ? (
              <p className="text-sm text-muted-foreground">Members of this server start a chat by typing /chat. Recatch then messages them privately and your flows answer.</p>
            ) : null}
            {bot.lastHealthError ? (
              <p className="text-sm text-destructive">{bot.lastHealthError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Last health {bot.lastHealthAt ? new Date(bot.lastHealthAt).toLocaleString() : "—"}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void health()} disabled={busy}>
                Run health check
              </Button>
              <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {bot ? <BotFieldsCard botId={bot.id} /> : null}
      {bot ? <AlertsCard botId={bot.id} /> : null}
      {bot ? <StripeCard botId={bot.id} /> : null}
      {bot ? <FieldsCard botId={bot.id} /> : null}
      {bot ? <TagsCard botId={bot.id} /> : null}
      {bot ? <ActivityCard botId={bot.id} /> : null}

      <TeamCard />

      {bots.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>Click one to work in it. The sidebar switcher does the same.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {bots.map((item) => (
              <Button
                key={item.id}
                variant={item.id === bot?.id ? "default" : "outline"}
                size="sm"
                onClick={() => setBotId(item.id)}
              >
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: CHANNELS[item.channel].color }} />
                {CHANNELS[item.channel].label} · {item.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
