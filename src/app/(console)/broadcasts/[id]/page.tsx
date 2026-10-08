import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ownsBot } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts } from "@/lib/db/schema";
import { describeCondition, sanitizeSegment, type Segment } from "@/lib/segments";
import { BroadcastDetail } from "./broadcast-detail";

function describeSegment(segment: Segment) {
  if (segment.conditions.length === 0) return null;
  return segment.conditions.map(describeCondition).join(segment.match === "any" ? " or " : " and ");
}

export const dynamic = "force-dynamic";

export default async function BroadcastDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; queued?: string; scheduled?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
  if (!broadcast || !(await ownsBot(broadcast.botId))) notFound();
  const waiting = broadcast.smartTiming
    ? await db
        .select({ sendAt: broadcastRecipients.sendAt })
        .from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, "pending"), gt(broadcastRecipients.sendAt, new Date())))
    : [];
  // A/B results: who replied within 48 hours of their copy.
  const variantRows = broadcast.bodyB
    ? await db
        .select({
          variant: broadcastRecipients.variant,
          sent: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'sent')::int`,
          // Fully qualified: an unqualified contact_id inside the subquery would bind to messages.contact_id.
          replied: sql<number>`count(*) filter (where broadcast_recipients.status = 'sent' and exists (
            select 1 from messages m where m.contact_id = broadcast_recipients.contact_id and m.direction = 'inbound'
            and m.created_at > broadcast_recipients.sent_at and m.created_at < broadcast_recipients.sent_at + interval '48 hours'))::int`,
        })
        .from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.broadcastId, id), isNotNull(broadcastRecipients.variant)))
        .groupBy(broadcastRecipients.variant)
    : [];
  const nextAt = waiting.reduce<Date | null>((min, row) => (row.sendAt && (!min || row.sendAt < min) ? row.sendAt : min), null);
  return (
    <BroadcastDetail
      notice={query.queued ? "queued" : query.scheduled ? "scheduled" : query.error}
      initialBroadcast={{
        id: broadcast.id,
        name: broadcast.name,
        body: broadcast.body,
        status: broadcast.status,
        totalCount: broadcast.totalCount,
        sentCount: broadcast.sentCount,
        failedCount: broadcast.failedCount,
        lastError: broadcast.lastError,
        scheduledAt: broadcast.scheduledAt ? new Date(broadcast.scheduledAt).toISOString() : null,
        segment: describeSegment(sanitizeSegment(broadcast.segment)),
        isFlow: Boolean(broadcast.flowId),
        smartTiming: broadcast.smartTiming,
        bodyB: broadcast.bodyB,
        variants: variantRows.map((row) => ({ variant: row.variant ?? "a", sent: Number(row.sent), replied: Number(row.replied) })),
        waitingCount: waiting.length,
        nextAt: nextAt ? nextAt.toISOString() : null,
      }}
    />
  );
}
