/**
 * Channel catalog. ManyChat runs Instagram, Messenger, WhatsApp, and Telegram from one console;
 * every send and every inbound webhook in Relay goes through the adapter for the account's channel.
 */
export type ChannelId = "telegram" | "instagram" | "messenger" | "whatsapp";

export const CHANNEL_IDS: ChannelId[] = ["telegram", "instagram", "messenger", "whatsapp"];

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
};

export function channelOf(value: string | null | undefined): ChannelId {
  return value && value in CHANNELS ? (value as ChannelId) : "telegram";
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
  /** Phone from a shared contact card (Telegram) or the WhatsApp sender number. */
  contactPhone?: string | null;
  externalMessageId?: string | null;
  /** Telegram callback query id to acknowledge. */
  ackCallbackId?: string | null;
  /** Conversation opened through a growth link ref (m.me/ig.me ?ref=). */
  referral?: string | null;
};

export type SentMessage = { message_id: string };
