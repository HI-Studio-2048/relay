import { currentUserId } from "@/lib/auth";
import { consoleScope } from "@/lib/current-bot";
import { listInboxThreads, listWorkspaceInbox } from "@/lib/store";
import { ConversationList } from "./conversation-list";

/** Live Chat: conversation list on the left, the open thread (or an empty state) on the right. */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const [scope, userId] = await Promise.all([consoleScope(), currentUserId()]);
  const threads = !userId ? [] : scope.aggregate ? await listWorkspaceInbox(userId) : scope.bot ? await listInboxThreads(scope.bot.id) : [];
  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList initialThreads={threads} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
