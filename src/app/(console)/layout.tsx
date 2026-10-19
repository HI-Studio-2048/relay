import { inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { BotProvider } from "@/components/bot-provider";
import { currentUser, ensureOwnerAccount } from "@/lib/auth";
import { workspaceGate } from "@/lib/billing/gate";
import { listBots } from "@/lib/bots";
import { consoleScope } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { ALL_CHANNELS } from "@/lib/scope";
import { listInbox } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await ensureOwnerAccount();
  const user = await currentUser();
  // A valid cookie for a deleted user: clear it and go back through login.
  if (!user) redirect("/api/auth/logout");
  if ((await workspaceGate(user.id)) !== "ok") redirect("/billing");
  const [bots, scope] = await Promise.all([listBots(user.id), consoleScope()]);
  const bot = scope.bot;
  let inboxCount = 0;
  let confirmCount = 0;
  const ids = scope.aggregate ? scope.bots.map((item) => item.id) : bot ? [bot.id] : [];
  if (ids.length) {
    const db = await getDb();
    const [threads, awaiting] = await Promise.all([
      listInbox(ids),
      db.select().from(broadcasts).where(inArray(broadcasts.botId, ids)),
    ]);
    inboxCount = threads.length;
    confirmCount = awaiting.filter((row) => row.status === "awaiting_confirm").length;
  }
  return (
    <BotProvider initialBots={bots} initialBotId={bot?.id ?? null} initialScope={scope.aggregate ? ALL_CHANNELS : bot?.id ?? null}>
      <AppShell user={user} inboxCount={inboxCount} confirmCount={confirmCount}>
        {/* Pages copy their server data into state, so switching accounts has to remount them.
            Without this the Flows list kept showing the old account while New flow saved to the new one. */}
        <Fragment key={scope.aggregate ? ALL_CHANNELS : bot?.id ?? "none"}>{children}</Fragment>
      </AppShell>
    </BotProvider>
  );
}
