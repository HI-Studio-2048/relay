import { AppShell } from "@/components/app-shell";
import { BotProvider } from "@/components/bot-provider";
import { listBots } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const bots = await listBots();
  return (
    <BotProvider initialBots={bots}>
      <AppShell>{children}</AppShell>
    </BotProvider>
  );
}
