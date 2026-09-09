import { log } from "@/lib/logger";
import {
  mediaCaption,
  parseStoredMediaUrl,
  readMediaFile,
  telegramMediaField,
  telegramSendMethod,
} from "@/lib/media";
import { renderTelegramText } from "@/lib/telegram-format";
import type { FlowMedia, OutboundReply } from "@/lib/types";

type TelegramOk<T> = { ok: true; result: T };
type TelegramErr = { ok: false; description?: string; error_code?: number };

export class TelegramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramApiError";
  }
}

async function parseTelegram<T>(method: string, response: Response): Promise<T> {
  const json = (await response.json()) as TelegramOk<T> | TelegramErr;
  if (!json.ok) {
    log.warn(`Telegram ${method} failed`, json.description ?? response.status);
    throw new TelegramApiError(json.description ?? `Telegram ${method} failed`);
  }
  return json.result;
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseTelegram<T>(method, response);
}

async function callForm<T>(token: string, method: string, form: FormData): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, { method: "POST", body: form });
  return parseTelegram<T>(method, response);
}

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
  last_error_date?: number;
};

export async function getMe(token: string) {
  return call<TelegramUser>(token, "getMe");
}

export async function getWebhookInfo(token: string) {
  return call<WebhookInfo>(token, "getWebhookInfo");
}

export async function setWebhook(token: string, url: string, secretToken: string) {
  return call<boolean>(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function deleteWebhook(token: string) {
  return call<boolean>(token, "deleteWebhook", { drop_pending_updates: false });
}

export type ReplyMarkupOptions = {
  /** Quick replies: a one-time reply keyboard, two per row. */
  keyboard?: string[];
  removeKeyboard?: boolean;
  /** Prepend a "share my phone number" button (Telegram request_contact). */
  requestContact?: boolean;
};

export const SHARE_PHONE_LABEL = "📱 Share my phone number";

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

export function replyMarkup(
  buttons?: { text: string; data?: string; url?: string }[],
  options?: ReplyMarkupOptions,
) {
  if (buttons?.length) {
    return {
      inline_keyboard: [
        buttons.map((button) =>
          button.url
            ? { text: button.text, url: button.url }
            : { text: button.text, callback_data: button.data ?? "n:" },
        ),
      ],
    };
  }
  const keyboard = options?.keyboard?.filter((text) => text.trim()) ?? [];
  if (keyboard.length > 0 || options?.requestContact) {
    const rows: { text: string; request_contact?: boolean }[][] = chunk(
      keyboard.map((text) => ({ text })),
      2,
    );
    if (options?.requestContact) rows.unshift([{ text: SHARE_PHONE_LABEL, request_contact: true }]);
    return {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  }
  if (options?.removeKeyboard) return { remove_keyboard: true };
  return undefined;
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  buttons?: { text: string; data?: string; url?: string }[],
  options?: ReplyMarkupOptions,
) {
  const rendered = renderTelegramText(text);
  return call<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: rendered.text,
    ...(rendered.parse_mode ? { parse_mode: rendered.parse_mode } : {}),
    reply_markup: replyMarkup(buttons, options),
  });
}

export async function sendChatAction(token: string, chatId: string, action = "typing") {
  return call<boolean>(token, "sendChatAction", { chat_id: chatId, action });
}

export type BotCommand = { command: string; description: string };

/** Telegram's "/" menu. Pass an empty list to clear it. */
export async function setMyCommands(token: string, commands: BotCommand[]) {
  return call<boolean>(token, "setMyCommands", { commands });
}

export async function sendMedia(
  token: string,
  chatId: string,
  media: FlowMedia,
  caption?: string,
  buttons?: { text: string; data?: string; url?: string }[],
  options?: ReplyMarkupOptions,
) {
  const method = telegramSendMethod(media);
  const field = telegramMediaField(media);
  const markup = replyMarkup(buttons, options);
  const rendered = mediaCaption(caption) ? renderTelegramText(mediaCaption(caption)!) : undefined;
  const trimmed = rendered?.text;
  const parsed = parseStoredMediaUrl(media.url);

  if (parsed?.type === "local") {
    const file = await readMediaFile(parsed.id);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append(
      field,
      new Blob([Buffer.from(file.bytes)], { type: file.record.mime }),
      file.record.filename,
    );
    if (trimmed) form.append("caption", trimmed);
    if (rendered?.parse_mode) form.append("parse_mode", rendered.parse_mode);
    if (markup) form.append("reply_markup", JSON.stringify(markup));
    return callForm<{ message_id: number }>(token, method, form);
  }

  const remote = parsed?.type === "remote" ? parsed.url : media.url;
  return call<{ message_id: number }>(token, method, {
    chat_id: chatId,
    [field]: remote,
    caption: trimmed,
    ...(rendered?.parse_mode ? { parse_mode: rendered.parse_mode } : {}),
    reply_markup: markup,
  });
}

export async function sendFlowReply(token: string, chatId: string, reply: OutboundReply) {
  const options: ReplyMarkupOptions = {
    keyboard: reply.keyboard,
    removeKeyboard: reply.removeKeyboard,
    requestContact: reply.requestContact,
  };
  if (reply.media) {
    return sendMedia(token, chatId, reply.media, reply.text, reply.buttons, options);
  }
  return sendMessage(token, chatId, reply.text, reply.buttons, options);
}

export async function answerCallbackQuery(token: string, callbackQueryId: string) {
  return call<boolean>(token, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    from?: TelegramUser;
    chat?: { id: number; type: string };
    /** Shared via a request_contact reply-keyboard button. */
    contact?: { phone_number: string; first_name?: string; last_name?: string; user_id?: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { message_id: number; chat?: { id: number } };
  };
};
