import { renderForChannel } from "@/lib/channels/format";
import { absoluteMediaUrl, graphPost } from "@/lib/channels/meta";
import { CHANNELS, isRelayPayload, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { log } from "@/lib/logger";
import type { FlowMedia, OutboundReply } from "@/lib/types";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function waMediaType(media: FlowMedia): "image" | "video" | "audio" | "document" {
  if (media.kind === "video") return "video";
  if (media.kind === "audio") return "audio";
  if (media.kind === "document") return "document";
  return "image";
}

export type WhatsAppMessage = Record<string, unknown>;

/**
 * WhatsApp Cloud API bodies for one engine reply. Callback buttons and quick replies both become
 * interactive reply buttons (max 3) or a list (max 10). URL buttons are appended as text.
 */
export function buildWhatsAppMessages(reply: OutboundReply): WhatsAppMessage[] {
  const meta = CHANNELS.whatsapp;
  const messages: WhatsAppMessage[] = [];
  let text = renderForChannel(reply.text ?? "", meta).trim();

  const urlButtons = (reply.buttons ?? []).filter((button) => button.url);
  if (urlButtons.length > 0) {
    text = [text, ...urlButtons.map((button) => `${button.text}: ${button.url}`)].filter(Boolean).join("\n");
  }

  const choices = [
    ...(reply.buttons ?? []).filter((button) => !button.url).map((button) => ({ id: button.data ?? "n:", title: button.text })),
    ...(reply.keyboard ?? []).map((title) => ({ id: `qr:${title}`, title })),
  ];

  if (reply.media) {
    const link = absoluteMediaUrl(reply.media);
    if (link) {
      const type = waMediaType(reply.media);
      const captionable = type !== "audio" && choices.length === 0;
      messages.push({
        type,
        [type]: { link, ...(captionable && text ? { caption: clip(text, 1024) } : {}) },
      });
      if (captionable && text) text = "";
    } else {
      log.warn("WhatsApp media skipped: set PUBLIC_URL so uploads have a public address");
    }
  }

  if (choices.length === 0) {
    if (text) messages.push({ type: "text", text: { body: clip(text, 4096), preview_url: true } });
    return messages;
  }

  const body = clip(text || "Choose an option", 1024);
  if (choices.length <= meta.maxButtons) {
    messages.push({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: choices.map((choice) => ({ type: "reply", reply: { id: clip(choice.id, 256), title: clip(choice.title, 20) } })) },
      },
    });
    return messages;
  }

  messages.push({
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: "Choose",
        sections: [{ rows: choices.slice(0, 10).map((choice) => ({ id: clip(choice.id, 200), title: clip(choice.title, 24) })) }],
      },
    },
  });
  return messages;
}

export async function sendWhatsAppReply(account: ChannelAccount, to: string, reply: OutboundReply): Promise<SentMessage> {
  if (!account.externalAccountId) throw new Error("WhatsApp phone number id is missing");
  let last: SentMessage = { message_id: "" };
  for (const message of buildWhatsAppMessages(reply)) {
    const sent = await graphPost<{ messages?: { id?: string }[] }>(`${account.externalAccountId}/messages`, account.token, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...message,
    });
    last = { message_id: sent.messages?.[0]?.id ?? "" };
  }
  return last;
}

type WaMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  referral?: { ref?: string };
};

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: WaMessage[];
      };
    }[];
  }[];
};

/** Normalize WhatsApp Cloud API inbound messages. Status callbacks carry no messages and are ignored. */
export function parseWhatsAppWebhook(payload: WhatsAppWebhookPayload): NormalizedInbound[] {
  const events: NormalizedInbound[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const names = new Map((value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name ?? null]));
      for (const message of value.messages) {
        if (!message.from) continue;
        const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
        const chosenId = reply?.id ?? message.button?.payload ?? null;
        let text: string | null = message.text?.body ?? reply?.title ?? message.button?.text ?? null;
        if (chosenId?.startsWith("qr:")) text = chosenId.slice(3);
        if (!text && message.type && message.type !== "text") text = `[${message.type}]`;
        const [first, ...rest] = (names.get(message.from) ?? "").split(" ");
        events.push({
          externalUserId: message.from,
          firstName: first || null,
          lastName: rest.join(" ") || null,
          text,
          callbackData: isRelayPayload(chosenId) ? chosenId : null,
          contactPhone: `+${message.from.replace(/^\+/, "")}`,
          externalMessageId: message.id ?? null,
          referral: message.referral?.ref ?? null,
        });
      }
    }
  }
  return events;
}
