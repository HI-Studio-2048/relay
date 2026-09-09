import Link from "next/link";
import { currentBot } from "@/lib/current-bot";
import { displayName } from "@/lib/lead-capture";
import { listInbox, loadContactRecord } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect a bot to open the inbox.</p>;
  }

  const rows = await listInbox(bot.id);
  const threads = await Promise.all(
    rows.map(async (row) => {
      const contact = await loadContactRecord(row.contact.id);
      return {
        contactId: row.contact.id,
        name: contact ? displayName(contact) : row.contact.telegramUserId,
        username: row.contact.username,
        status: contact?.inboxStatus ?? row.contact.inboxStatus ?? "open",
        lastAt: row.lastAt,
      };
    }),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Live threads. Replies send through Telegram and stay on the contact record.
        </p>
      </div>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No conversations yet. When someone messages the bot, the thread appears here.
        </p>
      ) : (
        <div className="divide-y rounded-xl ring-1 ring-foreground/10">
          {threads.map((thread) => (
            <Link
              key={thread.contactId}
              href={`/inbox/${thread.contactId}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">{thread.name}</p>
                <p className="text-xs text-muted-foreground">
                  {thread.status === "closed" ? "Closed" : "Open"}
                  {thread.username ? ` · @${thread.username}` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {thread.lastAt ? new Date(thread.lastAt).toLocaleString() : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
