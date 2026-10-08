import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm space-y-2">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#eaf3ff] text-[#0084ff]">
          <Inbox className="size-5" />
        </span>
        <p className="font-medium text-[#1b1f24]">Pick a conversation</p>
        <p className="text-sm text-[#6b7280]">
          Open threads are listed on the left. Use ↑ ↓ to move through them, reply with Enter, and “Close &amp; next”
          to clear the queue fast.
        </p>
      </div>
    </div>
  );
}
