import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import type { FlowDefinition, TriggerType } from "@/lib/types";
import { FlowEditor } from "./flow-editor";

export const dynamic = "force-dynamic";

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [flow] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
  if (!flow) notFound();
  return (
    <FlowEditor
      initialFlow={{
        id: flow.id,
        name: flow.name,
        triggerType: flow.triggerType as TriggerType,
        triggerValue: flow.triggerValue,
        isActive: flow.isActive,
        definition: flow.definition as FlowDefinition,
      }}
    />
  );
}
