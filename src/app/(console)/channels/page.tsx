import { RadioTower } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { ConnectedApps, type ConnectedApp } from "@/components/connected-apps";
import { currentUserId } from "@/lib/auth";
import { zernioConfigured } from "@/lib/channels/zernio";
import { listConnections } from "@/lib/oauth/connections";
import { PROVIDER_IDS, PROVIDERS, providerConfigured } from "@/lib/oauth/providers";
import { ChannelsManager } from "./channels-manager";

export const dynamic = "force-dynamic";

/** Channels: every messaging channel Recatch has or is building, plus the apps you sign in to. */
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const query = await searchParams;
  const userId = await currentUserId();
  const connections = userId ? await listConnections(userId) : [];
  const apps: ConnectedApp[] = PROVIDER_IDS.filter((id) => id !== "google").map((id) => ({
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
        description="Connect the accounts this brand talks through. DMs from all of them land in one Live Chat and can trigger the same flows."
      />
      <ChannelsManager notice={notice} metaReady={zernioConfigured()} />
      <ConnectedApps apps={apps} />
    </div>
  );
}
