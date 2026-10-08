import { inboxThreads } from "@/app/api/inbox/route";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { currentBot } from "@/lib/current-bot";
import { InboxShell } from "./inbox-shell";

export const dynamic = "force-dynamic";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const bot = await currentBot();
  if (!bot) {
    return (
      <div className="p-6">
        <ConnectPrompt title="Connect a channel to open the inbox" />
      </div>
    );
  }
  const threads = await inboxThreads(bot.id);
  return (
    <InboxShell botId={bot.id} channel={bot.channel} initialThreads={threads}>
      {children}
    </InboxShell>
  );
}
