import { ConversationList } from "./conversation-list";

/** Live Chat: conversation list on the left, the open thread (or an empty state) on the right. */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
