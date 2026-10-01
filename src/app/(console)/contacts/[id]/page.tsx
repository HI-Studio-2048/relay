import { and, desc, eq, like, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { contacts, customFields, flowEvents, flows, growthLinkEvents, growthLinks, messages, tags } from "@/lib/db/schema";
import { loadContactRecord } from "@/lib/store";
import { ContactEditor } from "./contact-editor";
import { Journey, type JourneyEvent, type JourneySummary } from "./journey";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await loadContactRecord(id);
  if (!contact) notFound();
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  const [fieldRows, tagRows, flowRows, linkRows, [goalTotals], messageTotals, [lastRating]] = await Promise.all([
    db.select().from(customFields).where(eq(customFields.botId, row!.botId)),
    db.select().from(tags).where(eq(tags.botId, row!.botId)),
    db
      .select({ at: flowEvents.createdAt, kind: flowEvents.kind, name: flowEvents.name, value: flowEvents.value, flowName: flows.name })
      .from(flowEvents)
      .innerJoin(flows, eq(flows.id, flowEvents.flowId))
      .where(eq(flowEvents.contactId, id))
      .orderBy(desc(flowEvents.createdAt))
      .limit(100),
    db
      .select({ at: growthLinkEvents.createdAt, kind: growthLinkEvents.kind, name: growthLinks.name })
      .from(growthLinkEvents)
      .innerJoin(growthLinks, eq(growthLinks.id, growthLinkEvents.linkId))
      .where(eq(growthLinkEvents.contactId, id))
      .limit(20),
    db
      .select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${flowEvents.value}), 0)::float` })
      .from(flowEvents)
      .where(and(eq(flowEvents.contactId, id), eq(flowEvents.kind, "goal"))),
    db
      .select({ direction: messages.direction, count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.contactId, id))
      .groupBy(messages.direction),
    db
      .select({ body: messages.body })
      .from(messages)
      .where(and(eq(messages.contactId, id), like(messages.body, "[rating] %")))
      .orderBy(desc(messages.createdAt))
      .limit(1),
  ]);
  const summary: JourneySummary = {
    value: Number(goalTotals?.value ?? 0),
    goals: Number(goalTotals?.count ?? 0),
    messagesIn: messageTotals.find((row) => row.direction === "inbound")?.count ?? 0,
    messagesOut: messageTotals.find((row) => row.direction === "outbound")?.count ?? 0,
    lastRating: lastRating ? lastRating.body.slice("[rating] ".length) : null,
  };

  const events: JourneyEvent[] = [
    { at: new Date(row!.createdAt).toISOString(), kind: "joined" as const, label: "Became a contact", detail: row!.platform },
    ...linkRows.map((link) => ({ at: new Date(link.at).toISOString(), kind: "link" as const, label: `Came in through “${link.name}”` })),
    ...flowRows
      .filter((event) => event.kind !== "sent")
      .map((event) => ({
        at: new Date(event.at).toISOString(),
        kind: event.kind as JourneyEvent["kind"],
        label:
          event.kind === "start"
            ? `Started “${event.flowName}”`
            : event.kind === "click"
              ? `Tapped a button in “${event.flowName}”`
              : event.kind === "goal"
                ? `Reached goal “${event.name ?? "Goal"}”`
                : `Finished “${event.flowName}”`,
        detail: event.kind === "goal" && event.value ? String(event.value) : null,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-5">
      <ContactEditor
        botId={row!.botId}
        initialContact={contact}
        initialFields={fieldRows.filter((field) => !field.key.startsWith("_"))}
        initialTags={tagRows}
      />
      <Journey events={events} summary={summary} />
    </div>
  );
}
