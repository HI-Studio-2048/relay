import Link from "next/link";
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/chrome/empty-state";
import { MANYCHAT } from "@/components/chrome/tone";

export function ConnectPrompt({
  title = "Connect your social accounts",
  description = "Connect Telegram, Slack, Discord, Bluesky, Instagram, Messenger or WhatsApp. Keys are encrypted at rest.",
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
      action={<Button nativeButton={false} render={<Link href="/setup" />}>Open Settings</Button>}
    />
  );
}
