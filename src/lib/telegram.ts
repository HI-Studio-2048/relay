import { log } from "@/lib/logger";

type TelegramOk<T> = { ok: true; result: T };
type TelegramErr = { ok: false; description?: string; error_code?: number };

export class TelegramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramApiError";
  }
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as TelegramOk<T> | TelegramErr;
  if (!json.ok) {
    log.warn(`Telegram ${method} failed`, json.description ?? response.status);
    throw new TelegramApiError(json.description ?? `Telegram ${method} failed`);
  }
  return json.result;
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

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  buttons?: { text: string; data: string }[],
) {
  return call<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: buttons?.length
      ? {
          inline_keyboard: [
            buttons.map((button) => ({ text: button.text, callback_data: button.data })),
          ],
        }
      : undefined,
  });
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
