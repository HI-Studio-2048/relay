/**
 * Channel catalog. ManyChat runs Instagram, Messenger, WhatsApp, and Telegram from one console;
 * every send and every inbound webhook in Recatch goes through the adapter for the account's channel.
 * `zernio` is a hub: one API key brings every social account in a Zernio workspace.
 */
export type ChannelId = "zernio" | "telegram" | "instagram" | "messenger" | "whatsapp" | "discord" | "slack" | "bluesky" | "youtube";

export const CHANNEL_IDS: ChannelId[] = ["zernio", "telegram", "instagram", "messenger", "whatsapp", "discord", "slack", "bluesky", "youtube"];

export type ChannelMeta = {
  id: ChannelId;
  label: string;
  /** Brand color for badges. */
  color: string;
  /** Max inline buttons per message the platform renders. */
  maxButtons: number;
  /** Max quick replies per message. */
  maxQuickReplies: number;
  supportsUrlButtons: boolean;
  supportsTyping: boolean;
  /** Telegram "/" command menu. */
  supportsCommands: boolean;
  /** Reply-keyboard "share phone" button (Telegram). WhatsApp already knows the phone. */
  supportsPhoneShare: boolean;
  formatting: "html" | "whatsapp" | "plain";
  /** How a growth link opens the conversation. */
  linkStyle: "start_param" | "ref" | "prefill_text";
};

export const CHANNELS: Record<ChannelId, ChannelMeta> = {
  zernio: {
    id: "zernio",
    label: "Meta (Instagram, Messenger, WhatsApp)",
    color: "#0866FF",
    maxButtons: 3,
    maxQuickReplies: 13,
    supportsUrlButtons: true,
    supportsTyping: true,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    color: "#229ED9",
    maxButtons: 8,
    maxQuickReplies: 10,
    supportsUrlButtons: true,
    supportsTyping: true,
    supportsCommands: true,
    supportsPhoneShare: true,
    formatting: "html",
    linkStyle: "start_param",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    color: "#E1306C",
    maxButtons: 3,
    maxQuickReplies: 13,
    supportsUrlButtons: true,
    supportsTyping: true,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  messenger: {
    id: "messenger",
    label: "Messenger",
    color: "#0084FF",
    maxButtons: 3,
    maxQuickReplies: 13,
    supportsUrlButtons: true,
    supportsTyping: true,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25D366",
    maxButtons: 3,
    maxQuickReplies: 10,
    supportsUrlButtons: true,
    supportsTyping: false,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "whatsapp",
    linkStyle: "prefill_text",
  },
  discord: {
    id: "discord",
    label: "Discord",
    color: "#5865F2",
    maxButtons: 5,
    maxQuickReplies: 5,
    supportsUrlButtons: true,
    supportsTyping: true,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  slack: {
    id: "slack",
    label: "Slack",
    color: "#4A154B",
    maxButtons: 25,
    maxQuickReplies: 25,
    supportsUrlButtons: true,
    supportsTyping: false,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    color: "#1185FE",
    maxButtons: 0,
    maxQuickReplies: 0,
    supportsUrlButtons: false,
    supportsTyping: false,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    color: "#FF0000",
    maxButtons: 0,
    maxQuickReplies: 0,
    supportsUrlButtons: false,
    supportsTyping: false,
    supportsCommands: false,
    supportsPhoneShare: false,
    formatting: "plain",
    linkStyle: "ref",
  },
};

export function channelOf(value: string | null | undefined): ChannelId {
  return value && value in CHANNELS ? (value as ChannelId) : "telegram";
}

export function isZernioChannel(channel: ChannelId): boolean {
  return channel === "zernio";
}

export function isMetaChannel(channel: ChannelId): boolean {
  return channel === "instagram" || channel === "messenger" || channel === "whatsapp";
}

/** A connected account, decrypted for one request. Never log it. */
export type ChannelAccount = {
  id: string;
  channel: ChannelId;
  /** Bot token (Telegram) or access token (Meta). */
  token: string;
  /** Page id, Instagram account id, or WhatsApp phone number id. */
  externalAccountId: string | null;
  /** @username, page name, or display phone. */
  handle: string | null;
  /** Meta app secret for X-Hub-Signature-256 checks; verify token lives in webhookSecret. */
  appSecret: string | null;
  verifyToken: string;
  /** Bluesky: signed in with OAuth, so requests go through a stored session instead of an app password. */
  oauth?: boolean;
  /** YouTube: the Google connection whose token the calls use (refreshed there, never stored on the account). */
  connectionId?: string | null;
};

/** Channel-neutral inbound event, produced by each adapter's webhook parser. */
export type NormalizedInbound = {
  externalUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  text?: string | null;
  callbackData?: string | null;
  /** Label of the tapped button, when the platform sends it (inbox display only). */
  callbackTitle?: string | null;
  /** Phone from a shared contact card (Telegram) or the WhatsApp sender number. */
  contactPhone?: string | null;
  externalMessageId?: string | null;
  /** Telegram callback query id to acknowledge. */
  ackCallbackId?: string | null;
  /** Conversation opened through a growth link ref (m.me/ig.me ?ref=). */
  referral?: string | null;
  /** What happened: a DM (default), a public comment, or an Instagram story reply / mention. */
  kind?: "message" | "comment" | "story_reply" | "story_mention";
  /** Underlying network when the account is a hub (Zernio): instagram, facebook, tiktok… */
  platform?: string | null;
  /** Hub account the event arrived on (Zernio accountId). */
  channelAccountId?: string | null;
  /** Conversation id to reply into (Zernio conversationId). */
  threadId?: string | null;
  avatarUrl?: string | null;
  storyUrl?: string | null;
  /** Images, GIFs, videos and files the person sent, as the platform's (often short-lived) links. */
  attachments?: InboundAttachment[];
  comment?: InboundComment | null;
  /** Replaying a comment that was missed: DM only, no public reply, no hiding, no second inbox line. */
  catchUp?: boolean;
  /** Profile facts the platform sent with this event (follows_you, ig_followers, ig_verified). */
  profileFields?: Record<string, string>;
};

export type InboundAttachment = { url: string; type?: string | null; filename?: string | null };

export type InboundComment = {
  id: string;
  /** Id the comment-reply endpoints take (Zernio post id, else the platform post id). */
  postId: string;
  platformPostId: string;
  isReply: boolean;
  postCaption?: string | null;
  permalink?: string | null;
  /** Bluesky: content hashes of the comment and of the post at the top of its thread, which a reply needs. */
  cid?: string;
  rootCid?: string;
};

/** Who to send to. Telegram and Meta only need the user id; hub channels also need the thread. */
export type ChannelTarget = {
  externalUserId: string;
  threadId?: string | null;
  channelAccountId?: string | null;
  platform?: string | null;
};

/** Button payloads Recatch itself sends: a flow step (n:), a whole flow (flow:), or a CSAT rating (csat:). */
export function isRelayPayload(value: string | null | undefined): boolean {
  return Boolean(value && (value.startsWith("n:") || value.startsWith("flow:") || /^csat:[1-3]$/.test(value)));
}

export function channelTarget(contact: {
  telegramUserId: string;
  threadId?: string | null;
  channelAccountId?: string | null;
  platform?: string | null;
}): ChannelTarget {
  return {
    externalUserId: contact.telegramUserId,
    threadId: contact.threadId ?? null,
    channelAccountId: contact.channelAccountId ?? null,
    platform: contact.platform ?? null,
  };
}

export type SentMessage = { message_id: string };
