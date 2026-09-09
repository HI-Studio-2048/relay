/**
 * ManyChat-style rich text for Telegram.
 *
 * Authors write a small Markdown subset in message text; we render it to Telegram HTML:
 *   **bold**   __italic__ or _italic_   ~~strike~~   `code`   [label](https://url)
 *
 * Plain messages (no markers) are sent verbatim without parse_mode, so existing flows that
 * contain literal `<`, `&`, or `*` keep working exactly as before.
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

export function escapeTelegramHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}

const MARKER_RE = /\*\*[^*\n]+\*\*|__[^_\n]+__|(?<![\w])_[^_\n]+_(?![\w])|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/;

export function hasTelegramFormatting(text: string): boolean {
  return MARKER_RE.test(text);
}

function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`\n]+)`/g, (_, code: string) => `<code>${code}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, (_, inner: string) => `<b>${inner}</b>`)
    .replace(/__([^_\n]+)__/g, (_, inner: string) => `<i>${inner}</i>`)
    .replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, (_, inner: string) => `<i>${inner}</i>`)
    .replace(/~~([^~\n]+)~~/g, (_, inner: string) => `<s>${inner}</s>`)
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, label: string, url: string) => `<a href="${url.replace(/"/g, "%22")}">${label}</a>`,
    );
}

export type TelegramText = {
  text: string;
  parse_mode?: "HTML";
};

/** Convert authored text to what Telegram should receive. */
export function renderTelegramText(text: string): TelegramText {
  if (!hasTelegramFormatting(text)) return { text };
  return { text: renderInline(escapeTelegramHtml(text)), parse_mode: "HTML" };
}

/** Plain-text preview for the inbox and node cards: strips the markers. */
export function stripTelegramFormatting(text: string): string {
  if (!hasTelegramFormatting(text)) return text;
  return text
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
}
