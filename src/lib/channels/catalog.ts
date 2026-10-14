import type { ChannelId } from "@/lib/channels/types";

/**
 * Everything the Channels page lists: what works today and what is next.
 * `live` channels connect from Setup. `meta` ones are built and connect with your own Meta app until
 * Recatch's own app passes Meta review. `soon` ones are greyed out and not clickable.
 * Keep this in step with INTEGRATIONS.md.
 */
export type CatalogState = "live" | "meta" | "soon";

export type CatalogEntry = {
  id: string;
  label: string;
  mark: string;
  color: string;
  what: string;
  state: CatalogState;
  /** The network name the Meta sign-in uses, when this channel can connect that way. */
  meta?: "instagram" | "facebook" | "whatsapp";
  /** The channel id Setup opens for, when it is connectable. */
  channel?: ChannelId;
  /** One line on how it connects, or why it is not ready. */
  how: string;
};

export const CHANNEL_CATALOG: CatalogEntry[] = [
  { id: "telegram", label: "Telegram", mark: "TG", color: "#229ED9", what: "Bot chats, buttons, media and commands", state: "live", channel: "telegram", how: "Paste a BotFather token" },
  { id: "slack", label: "Slack", mark: "SL", color: "#4A154B", what: "Direct messages to the Recatch app", state: "live", channel: "slack", how: "Add to Slack, one click" },
  { id: "discord", label: "Discord", mark: "DC", color: "#5865F2", what: "Private chats started with /chat in your server", state: "live", channel: "discord", how: "Add to Discord, one click" },
  { id: "bluesky", label: "Bluesky", mark: "bsky", color: "#1185FE", what: "Direct messages", state: "live", channel: "bluesky", how: "Sign in with Bluesky, one click" },
  { id: "instagram", label: "Instagram", mark: "IG", color: "#E1306C", what: "DMs and story replies", state: "meta", channel: "instagram", meta: "instagram", how: "Your own Meta app and Page token for now" },
  { id: "messenger", label: "Messenger", mark: "f", color: "#0084FF", what: "Facebook Page DMs", state: "meta", channel: "messenger", meta: "facebook", how: "Your own Meta app and Page token for now" },
  { id: "whatsapp", label: "WhatsApp", mark: "WA", color: "#25D366", what: "WhatsApp Business conversations", state: "meta", channel: "whatsapp", meta: "whatsapp", how: "Your own Meta app and phone number ID for now" },
  { id: "threads", label: "Threads", mark: "@", color: "#000000", what: "Replies to your threads", state: "soon", how: "Comes with the Meta app" },
  { id: "x", label: "X", mark: "X", color: "#111111", what: "DMs and replies", state: "soon", how: "X charges for DM access" },
  { id: "tiktok", label: "TikTok", mark: "TT", color: "#FE2C55", what: "Video comments and DMs", state: "soon", how: "Sign-in works under Connected apps. Messaging needs TikTok's approval" },
  { id: "reddit", label: "Reddit", mark: "r/", color: "#FF4500", what: "Chats and comment replies", state: "soon", how: "Waiting on Reddit API access" },
  { id: "youtube", label: "YouTube", mark: "YT", color: "#FF0000", what: "Comments on your videos", state: "soon", how: "Sign-in works under Connected apps. Google verification is next" },
  { id: "linkedin", label: "LinkedIn", mark: "in", color: "#0A66C2", what: "Comments on your company posts", state: "soon", how: "Needs LinkedIn's partner program" },
  { id: "pinterest", label: "Pinterest", mark: "P", color: "#E60023", what: "Pins and boards", state: "soon", how: "Waiting on Pinterest's review" },
  { id: "imessage", label: "iMessage", mark: "iM", color: "#34C759", what: "Apple Messages for Business", state: "soon", how: "Apple only allows it through approved providers" },
];
