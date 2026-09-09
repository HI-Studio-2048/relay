import { eq } from "drizzle-orm";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { broadcastAudience, contactsWithTag } from "@/lib/store";
import { ComposeBroadcast } from "./compose-broadcast";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect a bot first.</p>;
  }
  const db = await getDb();
  const tagRows = await db.select().from(tags).where(eq(tags.botId, bot.id));
  const first = tagRows[0];
  const [tagAudience, everyone] = await Promise.all([
    first ? contactsWithTag(bot.id, first.id) : Promise.resolve([]),
    broadcastAudience(bot.id, null),
  ]);
  return (
    <ComposeBroadcast
      botId={bot.id}
      initialTags={tagRows.map((tag) => ({ id: tag.id, name: tag.name }))}
      initialAudience={tagAudience.length}
      initialEveryone={everyone.length}
    />
  );
}
