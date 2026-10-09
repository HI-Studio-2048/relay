import { RadioTower } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { ConnectedApps, type ConnectedApp } from "@/components/connected-apps";
import { currentBot } from "@/lib/current-bot";
import { currentUserId } from "@/lib/auth";
import { listConnections } from "@/lib/oauth/connections";
import { PROVIDER_IDS, PROVIDERS, providerConfigured } from "@/lib/oauth/providers";
import { ChannelsManager, ZernioSetup } from "./channels-manager";

export const dynamic = "force-dynamic";

/** Channels: connect Instagram, Facebook, WhatsApp, X, TikTok and more to this account. */
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const bot = await currentBot();
  const query = await searchParams;
  const userId = await currentUserId();
  const connections = userId ? await listConnections(userId) : [];
  const apps: ConnectedApp[] = PROVIDER_IDS.map((id) => ({
    provider: id,
    label: PROVIDERS[id].label,
    purpose: PROVIDERS[id].purpose,
    configured: providerConfigured(id),
    connections: connections.filter((connection) => connection.provider === id),
  }));
  const notice = query.connected
    ? { tone: "ok" as const, text: query.connected.slice(0, 240) }
    : query.error
      ? { tone: "error" as const, text: query.error.slice(0, 240) }
      : null;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Channels"
        icon={RadioTower}
        tone="start"
        description="Connect the social accounts this brand talks through. DMs and comments from all of them land in one Live Chat and can trigger the same flows."
      />
      {bot?.channel === "zernio" ? (
        <ChannelsManager
          botId={bot.id}
          accounts={bot.linkedAccounts}
          health={bot.lastHealthError}
          notice={notice}
        />
      ) : (
        <ZernioSetup currentName={bot?.name ?? null} currentChannel={bot?.channel ?? null} notice={notice} />
      )}
      <ConnectedApps apps={apps} />
    </div>
  );
}
