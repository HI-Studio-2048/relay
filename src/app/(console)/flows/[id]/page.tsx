import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FlowWorkspace } from "@/components/flow-canvas/flow-workspace";
import { getDb } from "@/lib/db";
import { customFields, flows, tags } from "@/lib/db/schema";
import type { FlowDefinition, TriggerType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [flow] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
  if (!flow) notFound();

  const [fieldRows, tagRows] = await Promise.all([
    db.select().from(customFields).where(eq(customFields.botId, flow.botId)),
    db.select().from(tags).where(eq(tags.botId, flow.botId)),
  ]);

  return (
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
    />
  );
}
