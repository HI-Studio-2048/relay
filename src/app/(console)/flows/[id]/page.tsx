import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ownsBot } from "@/lib/auth/resources";
import { FlowWorkspace } from "@/components/flow-canvas/flow-workspace";
import { FlowSharePanel } from "@/components/chrome/flow-share-panel";
import { getDb } from "@/lib/db";
import { channelOf } from "@/lib/channels/types";
import { bots, customFields, flows, tags } from "@/lib/db/schema";
import { listGrowthLinksForFlow } from "@/lib/growth-links";
import type { FlowDefinition, TriggerType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [flow] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
  if (!flow || !(await ownsBot(flow.botId))) notFound();

  const [fieldRows, tagRows, links, flowRows, botRows] = await Promise.all([
    db.select().from(customFields).where(eq(customFields.botId, flow.botId)),
    db.select().from(tags).where(eq(tags.botId, flow.botId)),
    listGrowthLinksForFlow(flow.botId, flow.id),
    db.select().from(flows).where(eq(flows.botId, flow.botId)),
    db.select().from(bots).where(eq(bots.id, flow.botId)).limit(1),
  ]);
  const channel = channelOf(botRows[0]?.channel);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col lg:order-1">
        <FlowWorkspace
          initialFlow={{
            id: flow.id,
            botId: flow.botId,
            name: flow.name,
            triggerType: flow.triggerType as TriggerType,
            triggerValue: flow.triggerValue,
            isActive: flow.isActive,
            definition: flow.definition as FlowDefinition,
          }}
          customFields={fieldRows.map((field) => ({ key: field.key, label: field.label }))}
          tagNames={tagRows.map((tag) => tag.name)}
          otherFlows={flowRows
            .filter((item) => item.id !== flow.id)
            .map((item) => ({ id: item.id, name: item.name }))}
          channel={channel}
        />
      </div>
      <div className="order-1 min-h-0 lg:order-2 lg:h-full">
        <FlowSharePanel botId={flow.botId} flowId={flow.id} flowName={flow.name} links={links} />
      </div>
    </div>
  );
}
