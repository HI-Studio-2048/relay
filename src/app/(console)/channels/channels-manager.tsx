"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Plus, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { zernioPlatformColor, zernioPlatformLabel } from "@/components/chrome/platform-badge";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type Linked = { id: string; platform: string; username: string | null; picture: string | null; needsReconnection?: boolean };
type Notice = { tone: "ok" | "error"; text: string } | null;

/** What each network brings into Relay, in the order people usually connect them. */
const NETWORKS: { platform: string; mark: string; what: string }[] = [
  { platform: "instagram", mark: "IG", what: "DMs, comments, story replies and mentions" },
  { platform: "facebook", mark: "f", what: "Messenger DMs and Page comments" },
  { platform: "whatsapp", mark: "WA", what: "WhatsApp Business conversations" },
  { platform: "twitter", mark: "X", what: "DMs and replies on X" },
  { platform: "tiktok", mark: "TT", what: "DMs and video comments" },
  { platform: "threads", mark: "@", what: "Replies to your threads" },
  { platform: "linkedin", mark: "in", what: "Comments on your company posts" },
  { platform: "youtube", mark: "YT", what: "Comments on your videos" },
  { platform: "reddit", mark: "r/", what: "Chats and comment replies" },
  { platform: "bluesky", mark: "bsky", what: "DMs and replies" },
];

function Mark({ platform, mark, size = "md" }: { platform: string; mark: string; size?: "md" | "sm" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold text-white",
        size === "md" ? "size-10 text-[13px]" : "size-8 text-[11px]",
      )}
      style={{ background: zernioPlatformColor(platform) }}
    >
      {mark}
    </span>
  );
}

/** "@name" for social handles; phone numbers (WhatsApp, SMS) as they are. */
function handle(account: Linked) {
  if (!account.username) return zernioPlatformLabel(account.platform);
  const name = account.username.replace(/^@/, "");
  return /^\+?[\d\s()-]+$/.test(name) ? name : `@${name}`;
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        notice.tone === "ok" ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#fef3f2] text-[#b42318]",
      )}
    >
      {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
      {notice.text}
    </p>
  );
}

export function ChannelsManager({ botId, accounts, health, notice }: { botId: string; accounts: Linked[]; health: string | null; notice: Notice }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const connect = async (platform: string, reconnectAccountId?: string) => {
    setBusy(reconnectAccountId ?? platform);
    try {
      const data = await api<{ authUrl: string }>(`/api/bots/${botId}/channels/connect`, {
        method: "POST",
        body: JSON.stringify({ platform, reconnectAccountId: reconnectAccountId ?? null }),
      });
      // The platform's own consent screen; Zernio brings them back to this page when done.
      window.location.assign(data.authUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the connection");
      setBusy(null);
    }
  };

  const disconnect = async (account: Linked) => {
    const name = `${zernioPlatformLabel(account.platform)}${account.username ? ` ${handle(account)}` : ""}`;
    if (!window.confirm(`Disconnect ${name}? New DMs and comments from it stop arriving. Contacts and history stay.`)) return;
    setBusy(account.id);
    try {
      await api(`/api/bots/${botId}/channels/${encodeURIComponent(account.id)}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      toast.success(`${name} disconnected`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      await api(`/api/bots/${botId}/health`, { method: "POST" });
      router.refresh();
      toast.success("Synced with Zernio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sync");
    } finally {
      setBusy(null);
    }
  };

  const counts = new Map<string, number>();
  for (const account of accounts) counts.set(account.platform, (counts.get(account.platform) ?? 0) + 1);
  const attention = accounts.filter((account) => account.needsReconnection).length;

  return (
    <div className="space-y-5">
      <NoticeBar notice={notice} />
      {health ? <NoticeBar notice={{ tone: "error", text: health }} /> : null}

      <CanvasCard className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-heading text-[15px] text-[#1b1f24]">Connected accounts</p>
            <p className="text-[12px] text-[#6b7280]">
              {accounts.length === 0
                ? "Nothing connected yet. Pick a network below."
                : `${accounts.length} account${accounts.length === 1 ? "" : "s"}${attention ? ` · ${attention} need${attention === 1 ? "s" : ""} reconnecting` : " · all healthy"}`}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void refresh()}>
            <RefreshCw className={cn("size-3.5", busy === "refresh" && "animate-spin")} />
            Refresh
          </Button>
        </div>
        {accounts.length ? (
          <ul className="divide-y divide-[#f0f2f4]">
            {accounts.map((account) => {
              const network = NETWORKS.find((item) => item.platform === account.platform);
              return (
                <li key={account.id} className="flex flex-wrap items-center gap-3 py-3">
                  {account.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.picture} alt="" className="size-8 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <Mark platform={account.platform} mark={network?.mark ?? account.platform.slice(0, 2).toUpperCase()} size="sm" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1b1f24]">{handle(account)}</p>
                    <p className="text-[12px] text-[#6b7280]">{zernioPlatformLabel(account.platform)}</p>
                  </div>
                  {account.needsReconnection ? (
                    <span className="rounded-full bg-[#fffaeb] px-2 py-0.5 text-[11px] font-medium text-[#b54708]">Needs reconnecting</span>
                  ) : (
                    <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-medium text-[#067647]">Live</span>
                  )}
                  <div className="flex gap-1.5">
                    {account.needsReconnection && network ? (
                      <Button size="sm" disabled={busy !== null} onClick={() => void connect(account.platform, account.id)}>
                        {busy === account.id ? "Opening…" : "Reconnect"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[#6b7280]"
                      aria-label={`Disconnect ${zernioPlatformLabel(account.platform)} ${handle(account)}`}
                      disabled={busy !== null}
                      onClick={() => void disconnect(account)}
                    >
                      <Unplug className="size-3.5" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CanvasCard>

      <div className="space-y-2">
        <p className="font-heading text-[15px] text-[#1b1f24]">Add a channel</p>
        <p className="text-[13px] text-[#6b7280]">
          You&apos;ll sign in on the network&apos;s own screen and pick the Page, profile or number to use. Nothing is posted for you.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NETWORKS.map((network) => {
            const connected = counts.get(network.platform) ?? 0;
            return (
              <CanvasCard key={network.platform} className="flex items-center gap-3 p-3">
                <Mark platform={network.platform} mark={network.mark} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1b1f24]">
                    {zernioPlatformLabel(network.platform)}
                    {connected ? <span className="ml-1.5 text-[11px] font-normal text-[#067647]">{connected} connected</span> : null}
                  </p>
                  <p className="text-[12px] leading-snug text-[#6b7280]">{network.what}</p>
                </div>
                <Button
                  size="sm"
                  variant={connected ? "outline" : "default"}
                  aria-label={connected ? `Add another ${zernioPlatformLabel(network.platform)} account` : `Connect ${zernioPlatformLabel(network.platform)}`}
                  disabled={busy !== null}
                  onClick={() => void connect(network.platform)}
                >
                  {busy === network.platform ? "Opening…" : connected ? <Plus className="size-3.5" /> : "Connect"}
                </Button>
              </CanvasCard>
            );
          })}
          <CanvasCard className="flex items-center gap-3 p-3">
            <Mark platform="telegram" mark="TG" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#1b1f24]">Telegram</p>
              <p className="text-[12px] leading-snug text-[#6b7280]">Bots connect directly with a BotFather token, as their own account</p>
            </div>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/setup" />}>
              Set up
            </Button>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}

/** First step when this account isn't on Zernio yet: paste the workspace API key once. */
export function ZernioSetup({ currentName, currentChannel, notice }: { currentName: string | null; currentChannel: string | null; notice: Notice }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const data = await api<{ bot: { id: string } }>("/api/bots", { method: "POST", body: JSON.stringify({ channel: "zernio", token: key.trim() }) });
      await api("/api/bots/select", { method: "POST", body: JSON.stringify({ botId: data.bot.id }) });
      toast.success("Zernio connected. Now add your social accounts.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect Zernio");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} />
      <CanvasCard className="space-y-3 p-4">
        <p className="font-heading text-[15px] text-[#1b1f24]">Step 1: connect your Zernio workspace</p>
        <p className="text-[13px] text-[#6b7280]">
          Relay reaches Instagram, Facebook, WhatsApp, X, TikTok and the rest through{" "}
          <a href="https://zernio.com" target="_blank" rel="noreferrer" className="text-[#0084ff] hover:underline">
            Zernio
          </a>
          . Create an API key in Zernio → Settings → API keys and paste it here. You only do this once; then you connect each network with a click.
          {currentName && currentChannel !== "zernio" ? ` (The account you're on, ${currentName}, connects directly and stays as it is.)` : ""}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="sk_…"
            aria-label="Zernio API key"
            className="flex-1"
            autoComplete="off"
          />
          <Button disabled={busy || !key.trim()} onClick={() => void save()}>
            {busy ? "Connecting…" : "Connect Zernio"}
          </Button>
        </div>
      </CanvasCard>
      <div className="grid gap-3 opacity-60 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {NETWORKS.slice(0, 6).map((network) => (
          <CanvasCard key={network.platform} className="flex items-center gap-3 p-3">
            <Mark platform={network.platform} mark={network.mark} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1b1f24]">{zernioPlatformLabel(network.platform)}</p>
              <p className="text-[12px] text-[#6b7280]">{network.what}</p>
            </div>
          </CanvasCard>
        ))}
      </div>
    </div>
  );
}
