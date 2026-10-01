import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect a bot first.</p>;
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.botId, bot.id))
    .orderBy(desc(broadcasts.createdAt));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Broadcasts</h1>
          <p className="text-sm text-muted-foreground">
            Send to everyone or to one tag. Nothing sends until you confirm. Telegram sends are rate-limited.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/broadcasts/new" />}>Compose</Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
      ) : (
        <div className="divide-y rounded-xl ring-1 ring-foreground/10">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/broadcasts/${row.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.sentCount}/{row.totalCount} sent · {row.failedCount} failed
                </p>
              </div>
              <Badge variant={row.status === "awaiting_confirm" ? "destructive" : "secondary"}>
                {row.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
