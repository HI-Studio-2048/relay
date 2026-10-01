import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
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
  if (!broadcast) notFound();
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
      }}
    />
  );
}
