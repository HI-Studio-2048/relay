import { CHANNELS, channelOf } from "@/lib/channels/types";
import { cn } from "@/lib/utils";

/** Network names and brand colors. */
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

export function platformLabel(platform: string | null | undefined) {
  return (platform && PLATFORMS[platform]?.label) || platform || "Social";
}

export function platformColor(platform: string | null | undefined) {
  return (platform && PLATFORMS[platform]?.color) || "#6B7280";
}

export function PlatformDot({ platform, className }: { platform: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: platformColor(platform) }}
    />
  );
}

/** Account name on a unified inbox row, colored by the channel it belongs to. */
export function ChannelBadge({ channel, name }: { channel: string; name: string }) {
  const meta = CHANNELS[channelOf(channel)];
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `${meta.color}1a`, color: meta.color }}
      title={meta.label}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Small pill naming the network a contact came from. Renders nothing for single-network accounts. */
export function PlatformBadge({ platform, className }: { platform: string | null | undefined; className?: string }) {
  if (!platform) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", className)}
      style={{ background: `${platformColor(platform)}1a`, color: platformColor(platform) }}
    >
      <PlatformDot platform={platform} className="size-1.5" />
      {platformLabel(platform)}
    </span>
  );
}
