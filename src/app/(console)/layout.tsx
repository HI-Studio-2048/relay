import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BotProvider } from "@/components/bot-provider";
import { currentUser, ensureOwnerAccount } from "@/lib/auth";
import { listBots } from "@/lib/bots";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { listInbox } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await ensureOwnerAccount();
  const user = await currentUser();
  // A valid cookie for a deleted user: clear it and go back through login.
  if (!user) redirect("/api/auth/logout");
  const [bots, bot] = await Promise.all([listBots(user.id), currentBot()]);
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
    <BotProvider initialBots={bots} initialBotId={bot?.id ?? null}>
      <AppShell user={user} inboxCount={inboxCount} confirmCount={confirmCount}>
        {children}
      </AppShell>
    </BotProvider>
  );
}
