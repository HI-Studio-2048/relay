import { BroadcastConfirmError } from "@/lib/broadcast";
import { TelegramApiError } from "@/lib/telegram";
import { redactSecrets } from "@/lib/crypto";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(error: unknown, fallback = "Request failed") {
  if (error instanceof BroadcastConfirmError) {
    return json({ error: error.message, code: error.code }, 409);
  }
  if (error instanceof TelegramApiError) {
    return json({ error: redactSecrets(error.message) }, 502);
  }
  const message = error instanceof Error ? redactSecrets(error.message) : fallback;
  return json({ error: message }, 400);
}

export type RouteParams<T extends Record<string, string>> = {
  params: Promise<T>;
};

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
