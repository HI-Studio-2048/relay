"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";

export default function SetupPage() {
  const { bot, refresh, setBotId } = useBot();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const data = await api<{ bot: { id: string; name: string } }>("/api/bots", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setBotId(data.bot.id);
      setToken("");
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
    if (!window.confirm("Delete this bot and its contacts, flows, and messages?")) return;
    setBusy(true);
    try {
      await api(`/api/bots/${bot.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      await refresh();
      toast.success("Bot removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Bot connection</h1>
        <p className="text-sm text-muted-foreground">
          Token is encrypted at rest and never written to logs. Telegram is the only channel in v1.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paste a BotFather token</CardTitle>
          <CardDescription>
            Talk to @BotFather, create a bot, copy the token. Relay calls getMe, stores the token
            encrypted, and sets the webhook to /api/telegram/webhook/&lt;botId&gt;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="token">Bot token</Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              placeholder="123456:ABC…"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <Button onClick={() => void connect()} disabled={busy || !token.trim()}>
            {busy ? "Connecting…" : "Connect and set webhook"}
          </Button>
        </CardContent>
      </Card>

      {bot ? (
        <Card>
          <CardHeader>
            <CardTitle>{bot.name}</CardTitle>
            <CardDescription>
              Status {bot.status}
              {bot.webhookUrl ? ` · ${bot.webhookUrl}` : " · PUBLIC_URL missing, webhook not set"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                Delete bot
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
