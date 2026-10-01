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
  let offset = 0;
  return [
    ...intro,
    ...cards.map((card) => {
      // Number buttons across the whole gallery, matching how a typed "4" is read back.
      const part: OutboundReply = {
        ...rest,
        text: [card.title, card.subtitle, card.url].filter(Boolean).join("\n"),
        media: card.imageUrl ? { url: card.imageUrl, kind: "photo" as const } : undefined,
        buttons: card.buttons,
        buttonNumberOffset: offset,
        keyboard: undefined,
      };
      offset += card.buttons?.length ?? 0;
      return part;
    }),
  ];
}
