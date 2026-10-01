import type { OutboundReply } from "@/lib/types";

/**
 * Channels without a native carousel get a gallery as one message per card: the image with the title,
 * subtitle and link as its caption, and that card's buttons. Button callbacks are unchanged, so a tap
 * on any card still moves the flow on.
 */
export function cardsAsReplies(reply: OutboundReply): OutboundReply[] {
  if (!reply.cards?.length) return [reply];
  const { cards, ...rest } = reply;
  const intro: OutboundReply[] = reply.text.trim() ? [{ ...rest, buttons: undefined }] : [];
  return [
    ...intro,
    ...cards.map((card) => ({
      ...rest,
      text: [card.title, card.subtitle, card.url].filter(Boolean).join("\n"),
      media: card.imageUrl ? { url: card.imageUrl, kind: "photo" as const } : undefined,
      buttons: card.buttons,
      keyboard: undefined,
    })),
  ];
}
