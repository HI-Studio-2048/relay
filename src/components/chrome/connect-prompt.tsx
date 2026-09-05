import Link from "next/link";
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/chrome/empty-state";
import { MANYCHAT } from "@/components/chrome/tone";

export function ConnectPrompt({
  title = "Connect a Telegram bot",
  description = "Paste a BotFather token in Settings. Relay encrypts it, sets the webhook, and opens inbox, contacts, flows, and broadcasts for that bot.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={Cable}
      hex={MANYCHAT.start}
      title={title}
      description={description}
      action={<Button render={<Link href="/setup" />}>Open Settings</Button>}
    />
  );
}
