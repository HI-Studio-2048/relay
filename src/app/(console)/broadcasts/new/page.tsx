import { eq } from "drizzle-orm";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flows, tags } from "@/lib/db/schema";
import { broadcastAudience, segmentOptions } from "@/lib/store";
import { ComposeBroadcast } from "./compose-broadcast";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect an account first.</p>;
  }
  const db = await getDb();
  const [tagRows, flowRows, options, everyone] = await Promise.all([
    db.select().from(tags).where(eq(tags.botId, bot.id)),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.botId, bot.id)),
    segmentOptions(bot.id),
    broadcastAudience(bot.id, null),
  ]);
  const platforms = [...new Set([...options.platforms, ...(bot.linkedAccounts ?? []).map((account) => account.platform)])];
  return (
    <ComposeBroadcast
      botId={bot.id}
      channel={bot.channel}
      tags={tagRows.map((tag) => ({ id: tag.id, name: tag.name }))}
      flows={flowRows}
      options={{ ...options, platforms }}
      initialEveryone={everyone.length}
    />
  );
}
