import type { ChannelId } from "@/lib/channels/types";

/**
 * English connect tutorials on /how-to. The site has no locale routing, so this is the
 * public how-to rather than a translated section of a larger docs tree.
 * Files live under public/videos/tutorials and are served to signed-out visitors.
 */
export type HowToVideo = {
  channel: ChannelId;
  title: string;
  description: string;
  src: string;
  poster: string;
  captions: string;
};

const file = (channel: ChannelId, ext: string) => `/videos/tutorials/connect-${channel}.${ext}`;

export const HOW_TO_VIDEOS: HowToVideo[] = [
  {
    channel: "telegram",
    title: "Connect Telegram",
    description: "Create a bot with BotFather and paste the token so Recatch can set the webhook.",
    src: file("telegram", "mp4"),
    poster: file("telegram", "webp"),
    captions: file("telegram", "vtt"),
  },
  {
    channel: "instagram",
    title: "Connect Instagram",
    description: "Connect an Instagram professional account through your own Meta app and a Facebook Page.",
    src: file("instagram", "mp4"),
    poster: file("instagram", "webp"),
    captions: file("instagram", "vtt"),
  },
  {
    channel: "messenger",
    title: "Connect Messenger",
    description: "Connect a Facebook Page with your own Meta app, then paste the callback into Messenger webhooks.",
    src: file("messenger", "mp4"),
    poster: file("messenger", "webp"),
    captions: file("messenger", "vtt"),
  },
  {
    channel: "whatsapp",
    title: "Connect WhatsApp",
    description: "Connect WhatsApp Cloud API with a phone number ID and a system-user token.",
    src: file("whatsapp", "mp4"),
    poster: file("whatsapp", "webp"),
    captions: file("whatsapp", "vtt"),
  },
  {
    channel: "discord",
    title: "Connect Discord",
    description: "Add the shared bot in one click, or paste a token from your own Discord application.",
    src: file("discord", "mp4"),
    poster: file("discord", "webp"),
    captions: file("discord", "vtt"),
  },
  {
    channel: "slack",
    title: "Connect Slack",
    description: "Add to Slack in one click, or paste a bot token and signing secret from your own app.",
    src: file("slack", "mp4"),
    poster: file("slack", "webp"),
    captions: file("slack", "vtt"),
  },
  {
    channel: "bluesky",
    title: "Connect Bluesky",
    description: "Sign in with Bluesky, or paste a handle and an app password that can read direct messages.",
    src: file("bluesky", "mp4"),
    poster: file("bluesky", "webp"),
    captions: file("bluesky", "vtt"),
  },
];
