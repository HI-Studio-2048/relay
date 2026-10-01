import { cn } from "@/lib/utils";

/** Browser-safe copy of the Zernio platform palette (the adapter imports node:crypto). */
const PLATFORMS: Record<string, { label: string; color: string }> = {
  instagram: { label: "Instagram", color: "#E1306C" },
  facebook: { label: "Messenger", color: "#0084FF" },
  messenger: { label: "Messenger", color: "#0084FF" },
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  telegram: { label: "Telegram", color: "#229ED9" },
  twitter: { label: "X", color: "#111111" },
  tiktok: { label: "TikTok", color: "#FE2C55" },
  bluesky: { label: "Bluesky", color: "#1185FE" },
  reddit: { label: "Reddit", color: "#FF4500" },
  sms: { label: "SMS", color: "#6B7280" },
  rcs: { label: "RCS", color: "#4285F4" },
  imessage: { label: "iMessage", color: "#34C759" },
  slack: { label: "Slack", color: "#4A154B" },
  threads: { label: "Threads", color: "#000000" },
  youtube: { label: "YouTube", color: "#FF0000" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  pinterest: { label: "Pinterest", color: "#E60023" },
  googlebusiness: { label: "Google Business", color: "#4285F4" },
};

export function zernioPlatformLabel(platform: string | null | undefined) {
  return (platform && PLATFORMS[platform]?.label) || platform || "Social";
}

export function zernioPlatformColor(platform: string | null | undefined) {
  return (platform && PLATFORMS[platform]?.color) || "#6B7280";
}

export function PlatformDot({ platform, className }: { platform: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: zernioPlatformColor(platform) }}
    />
  );
}

/** Small pill naming the network a contact came from. Renders nothing for single-network accounts. */
export function PlatformBadge({ platform, className }: { platform: string | null | undefined; className?: string }) {
  if (!platform) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", className)}
      style={{ background: `${zernioPlatformColor(platform)}1a`, color: zernioPlatformColor(platform) }}
    >
      <PlatformDot platform={platform} className="size-1.5" />
      {zernioPlatformLabel(platform)}
    </span>
  );
}
