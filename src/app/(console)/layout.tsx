import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { BotProvider } from "@/components/bot-provider";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { listInbox } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const bots = await listBots();
  const bot = bots[0];
  let inboxCount = 0;
  let confirmCount = 0;
  if (bot) {
    const db = await getDb();
    const [threads, awaiting] = await Promise.all([
      listInbox(bot.id),
      db.select().from(broadcasts).where(eq(broadcasts.botId, bot.id)),
    ]);
    inboxCount = threads.length;
    confirmCount = awaiting.filter((row) => row.status === "awaiting_confirm").length;
  }
  return (
    <BotProvider initialBots={bots}>
      <AppShell inboxCount={inboxCount} confirmCount={confirmCount}>
        {children}
      </AppShell>
    </BotProvider>
  );
}
