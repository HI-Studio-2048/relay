import { log } from "@/lib/logger";
import {
  mediaCaption,
  parseStoredMediaUrl,
  readMediaFile,
  telegramMediaField,
  telegramSendMethod,
} from "@/lib/media";
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

function replyMarkup(buttons?: { text: string; data: string }[]) {
  if (!buttons?.length) return undefined;
  return {
    inline_keyboard: [buttons.map((button) => ({ text: button.text, callback_data: button.data }))],
  };
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  buttons?: { text: string; data: string }[],
) {
  return call<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup(buttons),
  });
}

export async function sendMedia(
  token: string,
  chatId: string,
  media: FlowMedia,
  caption?: string,
  buttons?: { text: string; data: string }[],
) {
  const method = telegramSendMethod(media);
  const field = telegramMediaField(media);
  const markup = replyMarkup(buttons);
  const trimmed = mediaCaption(caption);
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
    if (markup) form.append("reply_markup", JSON.stringify(markup));
    return callForm<{ message_id: number }>(token, method, form);
  }

  const remote = parsed?.type === "remote" ? parsed.url : media.url;
  return call<{ message_id: number }>(token, method, {
    chat_id: chatId,
    [field]: remote,
    caption: trimmed,
    reply_markup: markup,
  });
}

export async function sendFlowReply(token: string, chatId: string, reply: OutboundReply) {
  if (reply.media) {
    return sendMedia(token, chatId, reply.media, reply.text, reply.buttons);
  }
  return sendMessage(token, chatId, reply.text, reply.buttons);
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
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { message_id: number; chat?: { id: number } };
  };
};
