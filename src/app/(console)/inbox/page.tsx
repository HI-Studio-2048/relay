import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/chrome/empty-state";

export default function InboxPage() {
  return (
    <div className="hidden flex-1 items-center justify-center p-8 md:flex">
      <EmptyState
        icon={MessagesSquare}
        title="Pick a conversation"
        description="DMs, comments, story replies and mentions from every connected account land on the left. Replying here pauses the bot for that person until you resume it."
        className="w-full max-w-md"
      />
    </div>
  );
}
