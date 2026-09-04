import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { BroadcastDetail } from "./broadcast-detail";

export const dynamic = "force-dynamic";

export default async function BroadcastDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; queued?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
  if (!broadcast) notFound();
  return (
    <BroadcastDetail
      notice={query.queued ? "queued" : query.error}
      initialBroadcast={{
        id: broadcast.id,
        name: broadcast.name,
        body: broadcast.body,
        status: broadcast.status,
        totalCount: broadcast.totalCount,
        sentCount: broadcast.sentCount,
        failedCount: broadcast.failedCount,
        lastError: broadcast.lastError,
      }}
    />
  );
}
