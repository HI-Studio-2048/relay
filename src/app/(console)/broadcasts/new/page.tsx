import { eq } from "drizzle-orm";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { contactsWithTag } from "@/lib/store";
import { ComposeBroadcast } from "./compose-broadcast";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  const bots = await listBots();
  const bot = bots[0];
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect a bot first.</p>;
  }
  const db = await getDb();
  const tagRows = await db.select().from(tags).where(eq(tags.botId, bot.id));
  const first = tagRows[0];
  const audience = first ? (await contactsWithTag(bot.id, first.id)).length : 0;
  return (
    <ComposeBroadcast
      botId={bot.id}
      initialTags={tagRows.map((tag) => ({ id: tag.id, name: tag.name }))}
      initialAudience={audience}
    />
  );
}
