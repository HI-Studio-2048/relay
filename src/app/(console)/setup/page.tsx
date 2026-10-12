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
import { PlatformDot, zernioPlatformLabel } from "@/components/chrome/platform-badge";
import { BotFieldsCard } from "@/components/bot-fields-card";
import { TeamCard } from "@/components/team-card";
import { AlertsCard } from "@/components/alerts-card";
import { StripeCard } from "@/components/stripe-card";
import { FieldsCard } from "@/components/fields-card";
import { TagsCard } from "@/components/tags-card";
import { ActivityCard } from "@/components/activity-card";

const GUIDES: Record<ChannelId, { title: string; steps: string[]; tokenLabel: string; accountLabel?: string }> = {
  zernio: {
    title: "Every social account through Zernio",
    tokenLabel: "Zernio API key",
    accountLabel: "Only these Zernio account ids (optional, comma-separated)",
    steps: [
      "Connect Instagram, Facebook, WhatsApp, TikTok, X, LinkedIn, YouTube, Threads, Bluesky, Reddit and more in Zernio.",
      "Create an API key in Zernio → Settings → API keys and paste it here. Leave the account filter empty to route every account.",
      "Recatch registers its webhook with Zernio (DMs, comments, referrals) and signs it with its own secret. Comment → DM, story replies and live chat work across all of them.",
    ],
  },
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
  const [channel, setChannel] = useState<ChannelId>("zernio");
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [slackInstall, setSlackInstall] = useState(false);
  const [manualSlack, setManualSlack] = useState(false);
  const guide = GUIDES[channel];

  useEffect(() => {
    api<{ slackInstall: boolean }>("/api/channels/capabilities")
      .then((data) => setSlackInstall(data.slackInstall))
      .catch(() => undefined);
    // Add to Slack comes back here with the result in the address.
    const query = new URLSearchParams(window.location.search);
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
  const isZernio = channel === "zernio";
  const isDiscord = channel === "discord";
  const isSlack = channel === "slack";
  const isBluesky = channel === "bluesky";
  const isMeta = channel !== "telegram" && !isZernio && !isDiscord && !isSlack && !isBluesky;

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
      await api(`/api/bots/${bot.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      await refresh();
      toast.success("Account removed");
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
          Connect every social account at once through Zernio, or Telegram, Instagram, Messenger, and WhatsApp
          directly. Each connection gets its own inbox, contacts, and flows; switch between them in the sidebar.
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
            {CHANNEL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === channel) return;
                  // What was typed for one platform must never be sent to another.
                  setToken("");
                  setAccountId("");
                  setAppSecret("");
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

          {channel === "slack" && slackInstall && !manualSlack ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Add Recatch to your Slack workspace and approve it. People then message Recatch in Slack and your flows answer.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button nativeButton={false} render={<a href="/api/slack/install" />}>
                  Add to Slack
                </Button>
                <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setManualSlack(true)}>
                  Use my own Slack app instead
                </button>
              </div>
            </div>
          ) : null}

          <div className={channel === "slack" && slackInstall && !manualSlack ? "hidden" : "space-y-4"}>
          <div className="space-y-1">
            <p className="text-sm font-medium">{guide.title}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {isMeta || isZernio || isBluesky ? (
            <div className="space-y-2">
              <Label htmlFor="account">{guide.accountLabel}</Label>
              <Input
                id="account"
                autoComplete="off"
                placeholder={channel === "whatsapp" ? "1234567890123456" : isZernio ? "All accounts" : isBluesky ? "name.bsky.social" : "Page ID"}
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
              placeholder={isZernio ? "sk_…" : isMeta ? "EAAG…" : isDiscord ? "MTIz…" : isSlack ? "xoxb-…" : isBluesky ? "xxxx-xxxx-xxxx-xxxx" : "123456:ABC…"}
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
            {busy ? "Connecting…" : isMeta ? "Connect account" : isZernio ? "Connect Zernio" : isDiscord ? "Connect bot" : isSlack ? "Connect app" : isBluesky ? "Connect account" : "Connect and set webhook"}
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
            {bot.channel === "zernio" ? (
              <div className="space-y-2">
                {bot.linkedAccounts?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {bot.linkedAccounts.map((linked) => (
                      <span
                        key={linked.id}
                        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                        title={linked.id}
                      >
                        <PlatformDot platform={linked.platform} />
                        {zernioPlatformLabel(linked.platform)}
                        {linked.username ? <span className="text-muted-foreground">@{linked.username}</span> : null}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No social accounts in this Zernio workspace yet.</p>
                )}
                {bot.webhookUrl ? (
                  <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                    <p className="font-medium">Zernio webhook</p>
                    <p className="break-all">
                      <span className="text-muted-foreground">URL:</span> {bot.webhookUrl}
                    </p>
                    <p className="break-all">
                      <span className="text-muted-foreground">Signing secret:</span> {bot.verifyToken}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Registered automatically. Run a health check to refresh the account list.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : bot.channel === "slack" && bot.webhookUrl ? (
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
