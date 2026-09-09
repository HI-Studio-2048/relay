import { renderTelegramText, stripTelegramFormatting } from "@/lib/telegram-format";
import type { ChannelMeta } from "@/lib/channels/types";

/** WhatsApp uses its own inline markup: *bold* _italic_ ~strike~ ```code```. */
export function renderWhatsAppText(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, (_, code: string) => `\`\`\`${code}\`\`\``)
    .replace(/\*\*([^*\n]+)\*\*/g, (_, inner: string) => `*${inner}*`)
    .replace(/__([^_\n]+)__/g, (_, inner: string) => `_${inner}_`)
    .replace(/~~([^~\n]+)~~/g, (_, inner: string) => `~${inner}~`)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => `${label} (${url})`);
}

/** Text as the platform should receive it. Telegram callers use renderTelegramText for parse_mode. */
export function renderForChannel(text: string, channel: ChannelMeta): string {
  if (channel.formatting === "whatsapp") return renderWhatsAppText(text);
  if (channel.formatting === "plain") return stripTelegramFormatting(text);
  return renderTelegramText(text).text;
}
