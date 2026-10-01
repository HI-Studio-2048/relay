import { Plug } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { currentBot } from "@/lib/current-bot";
import { publicUrl } from "@/lib/env";
import { IntegrationsClient } from "./integrations-client";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const bot = await currentBot();
  if (!bot) return <p className="text-sm text-muted-foreground">Connect an account first.</p>;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="API & webhooks"
        icon={Plug}
        tone="action"
        description="Connect Relay to Zapier, Make, your CRM or your own backend: push events out with webhooks, and tag contacts, update fields, send messages or start flows with the API."
      />
      <IntegrationsClient botId={bot.id} origin={publicUrl() ?? ""} />
    </div>
  );
}
