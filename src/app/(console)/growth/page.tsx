import { eq } from "drizzle-orm";
import { Link2 } from "lucide-react";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { EmptyState } from "@/components/chrome/empty-state";
import { PageHeader } from "@/components/chrome/page-header";
import { CanvasCard, MANYCHAT } from "@/components/chrome/tone";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { flows, tags } from "@/lib/db/schema";
import { listGrowthLinks } from "@/lib/growth-links";
import { CreateGrowthLinkForm } from "./create-growth-link-form";
import { GrowthLinkCard } from "./growth-link-card";

export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  const bots = await listBots();
  const bot = bots[0];
  if (!bot) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Growth"
          icon={Link2}
          tone="action"
          title="Growth links"
          description="Trackable Telegram start links. Share a short URL or QR; /start payload attributes the contact."
        />
        <ConnectPrompt title="Connect a bot before creating growth links" />
      </div>
    );
  }

  const db = await getDb();
  const [links, tagRows, flowRows] = await Promise.all([
    listGrowthLinks(bot.id),
    db.select().from(tags).where(eq(tags.botId, bot.id)),
    db.select().from(flows).where(eq(flows.botId, bot.id)),
  ]);
  const flowNames = new Map(flowRows.map((flow) => [flow.id, flow.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Growth"
        icon={Link2}
        tone="action"
        title="Growth links"
        description="ManyChat-style start links. The short URL counts a click, then opens Telegram with a start param. /start attributes the contact, can apply a tag, and can kick a linked flow."
      />
      <CanvasCard className="p-4">
        <CreateGrowthLinkForm
          botId={bot.id}
          tags={tagRows.map((tag) => ({ id: tag.id, name: tag.name }))}
          flows={flowRows.map((flow) => ({ id: flow.id, name: flow.name }))}
        />
      </CanvasCard>
      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          hex={MANYCHAT.action}
          title="No growth links yet"
          description="Create a start param for a campaign. Share the short link or QR. Clicks and /start attributions show up here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <GrowthLinkCard
              key={link.id}
              link={{ ...link, flowName: link.flowId ? flowNames.get(link.flowId) ?? null : null }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
