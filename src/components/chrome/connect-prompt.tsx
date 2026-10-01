import Link from "next/link";
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/chrome/empty-state";
import { MANYCHAT } from "@/components/chrome/tone";

export function ConnectPrompt({
  title = "Connect your social accounts",
  description = "Paste a Zernio API key to bring in Instagram, Facebook, WhatsApp, TikTok and more at once — or connect Telegram, Instagram, Messenger or WhatsApp directly. Keys are encrypted at rest.",
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
