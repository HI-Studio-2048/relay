"use client";

import { useState } from "react";
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

const GUIDES: Record<ChannelId, { title: string; steps: string[]; tokenLabel: string; accountLabel?: string }> = {
  zernio: {
    title: "Every social account through Zernio",
    tokenLabel: "Zernio API key",
    accountLabel: "Only these Zernio account ids (optional, comma-separated)",
    steps: [
      "Connect Instagram, Facebook, WhatsApp, TikTok, X, LinkedIn, YouTube, Threads, Bluesky, Reddit and more in Zernio.",
      "Create an API key in Zernio → Settings → API keys and paste it here. Leave the account filter empty to route every account.",
      "Relay registers its webhook with Zernio (DMs, comments, referrals) and signs it with its own secret. Comment → DM, story replies and live chat work across all of them.",
    ],
  },
  telegram: {
    title: "Telegram bot",
    tokenLabel: "Bot token",
    steps: [
      "Talk to @BotFather, create a bot, copy the token.",
      "Relay calls getMe, stores the token encrypted, and sets the webhook for you.",
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
};

export default function SetupPage() {
  const { bot, bots, refresh, setBotId } = useBot();
  const [channel, setChannel] = useState<ChannelId>("zernio");
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const guide = GUIDES[channel];
  const isZernio = channel === "zernio";
  const isMeta = channel !== "telegram" && !isZernio;

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
                onClick={() => setChannel(id)}
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

          <div className="space-y-1">
            <p className="text-sm font-medium">{guide.title}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {isMeta || isZernio ? (
            <div className="space-y-2">
              <Label htmlFor="account">{guide.accountLabel}</Label>
              <Input
                id="account"
                autoComplete="off"
                placeholder={channel === "whatsapp" ? "1234567890123456" : isZernio ? "All accounts" : "Page ID"}
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
              placeholder={isZernio ? "sk_…" : isMeta ? "EAAG…" : "123456:ABC…"}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          {isMeta ? (
            <div className="space-y-2">
              <Label htmlFor="secret">App secret (recommended)</Label>
              <Input
                id="secret"
                type="password"
                autoComplete="off"
                placeholder="Used to verify webhook signatures"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
              />
            </div>
          ) : null}
          <Button onClick={() => void connect()} disabled={busy || !token.trim() || (isMeta && !accountId.trim())}>
            {busy ? "Connecting…" : isMeta ? "Connect account" : isZernio ? "Connect Zernio" : "Connect and set webhook"}
          </Button>
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
              {bot.webhookUrl ? "" : " · PUBLIC_URL missing, webhook not set"}
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
