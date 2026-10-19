import * as z from "zod/v4";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";

/**
 * Bring-your-own-key AI. An account that saves an OpenRouter key sends its AI calls there, so the
 * customer pays for their own usage and picks any model OpenRouter offers. Without a key the server's
 * Anthropic key (if set) is used. The key lives encrypted in bots.settings.openrouter, apart from
 * settings.ai, so the AI settings the browser reads never carry it.
 */
export type AiProvider = { kind: "openrouter"; apiKey: string; model: string };

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_API = "https://openrouter.ai/api/v1";

type StoredOpenRouter = { key: string; model: string; hint: string };
type RawSettings = Record<string, unknown> | null | undefined;

/** Why a call failed, phrased for the person who owns the key. */
export class OpenRouterError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OpenRouterError";
  }
}

function stored(settings: RawSettings): StoredOpenRouter | null {
  const raw = settings?.openrouter as Partial<StoredOpenRouter> | undefined;
  if (!raw || typeof raw.key !== "string" || !raw.key) return null;
  return { key: raw.key, model: typeof raw.model === "string" && raw.model ? raw.model : DEFAULT_OPENROUTER_MODEL, hint: raw.hint ?? "" };
}

/** The provider to call for this account, or undefined to fall back to the server's own key. */
export function readAiProvider(settings: RawSettings): AiProvider | undefined {
  const row = stored(settings);
  if (!row) return undefined;
  try {
    return { kind: "openrouter", apiKey: decryptSecret(row.key), model: row.model };
  } catch {
    // Saved under an older ENCRYPTION_KEY. Treat it as not connected so the page asks for the key again.
    return undefined;
  }
}

/** What the browser may know: whether a key is saved, its last four characters and the model. Never the key. */
export function openRouterStatus(settings: RawSettings) {
  const row = stored(settings);
  return row ? { connected: true, model: row.model, hint: row.hint } : { connected: false, model: DEFAULT_OPENROUTER_MODEL, hint: "" };
}

export function withOpenRouter(settings: RawSettings, input: { apiKey: string; model: string }): Record<string, unknown> {
  const apiKey = input.apiKey.trim();
  const row: StoredOpenRouter = { key: encryptSecret(apiKey), model: input.model.trim() || DEFAULT_OPENROUTER_MODEL, hint: apiKey.slice(-4) };
  return { ...(settings ?? {}), openrouter: row };
}

export function withoutOpenRouter(settings: RawSettings): Record<string, unknown> {
  const { openrouter: _removed, ...rest } = settings ?? {};
  return rest;
}

export function withOpenRouterModel(settings: RawSettings, model: string): Record<string, unknown> {
  const row = stored(settings);
  if (!row) return { ...(settings ?? {}) };
  return { ...(settings ?? {}), openrouter: { ...row, model: model.trim() || DEFAULT_OPENROUTER_MODEL } };
}

function headers(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "http-referer": publicUrl() ?? "https://recatch.app",
    "x-title": "Recatch",
  };
}

function explain(status: number, body: string) {
  if (status === 401) return "OpenRouter rejected the key. Check it and save it again.";
  if (status === 402) return "Your OpenRouter account is out of credits.";
  if (status === 429) return "OpenRouter is rate limiting this key. Try again in a moment.";
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") detail = `: ${parsed.error.message.slice(0, 200)}`;
  } catch {
    // Not JSON, keep the status only.
  }
  return `OpenRouter returned ${status}${detail}`;
}

/** Throws OpenRouterError when the key is not accepted. Used when saving, so a typo is caught straight away. */
export async function verifyOpenRouterKey(apiKey: string) {
  const response = await fetch(`${OPENROUTER_API}/key`, { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) }).catch(() => {
    throw new OpenRouterError("Could not reach OpenRouter to check the key");
  });
  if (!response.ok) throw new OpenRouterError(explain(response.status, await response.text().catch(() => "")), response.status);
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}

type ChatBody = { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };

/** OpenAI-style chat message, the shape OpenRouter takes for tool calling. */
export type OpenRouterMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenRouterTool = { type: "function"; function: { name: string; description: string; parameters: unknown } };

type ToolChatBody = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

/**
 * One tool-calling turn through OpenRouter (OpenAI-compatible). Returns the text and the tool calls
 * the model asked for, with arguments parsed. Arguments that are not valid JSON come back as {} so
 * the tool reports a validation error to the model instead of the whole turn failing.
 */
export async function openRouterToolTurn(
  provider: AiProvider,
  input: { messages: OpenRouterMessage[]; tools: OpenRouterTool[]; maxTokens: number },
): Promise<{ text: string; toolCalls: { id: string; name: string; input: unknown }[] }> {
  const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
    method: "POST",
    headers: headers(provider.apiKey),
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: provider.model,
      max_tokens: Math.min(input.maxTokens, 8000),
      messages: input.messages,
      tools: input.tools,
    }),
  }).catch(() => {
    throw new OpenRouterError("Could not reach OpenRouter");
  });
  const text = await response.text();
  if (!response.ok) throw new OpenRouterError(explain(response.status, text), response.status);
  let message: NonNullable<NonNullable<ToolChatBody["choices"]>[number]["message"]> | undefined;
  try {
    message = (JSON.parse(text) as ToolChatBody).choices?.[0]?.message;
  } catch {
    throw new OpenRouterError("OpenRouter sent back something unreadable");
  }
  if (!message) throw new OpenRouterError("The model returned an empty answer. Try another model.");
  const toolCalls = (message.tool_calls ?? [])
    .filter((call) => typeof call.function?.name === "string" && call.function.name)
    .map((call, index) => {
      let args: unknown = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      return { id: call.id || `call_${index}`, name: call.function!.name!, input: args };
    });
  return { text: (message.content ?? "").trim(), toolCalls };
}

/** One structured completion through OpenRouter. Models differ in schema support, so a 400 retries as plain JSON. */
export async function openRouterParse<T extends z.ZodType>(
  provider: AiProvider,
  schema: T,
  input: { system: string; user: string; maxTokens: number },
): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema);
  const call = async (strict: boolean) => {
    const system = strict ? input.system : `${input.system}\n\nReply with only a JSON object matching this JSON Schema, no other text:\n${JSON.stringify(jsonSchema)}`;
    return fetch(`${OPENROUTER_API}/chat/completions`, {
      method: "POST",
      headers: headers(provider.apiKey),
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: provider.model,
        max_tokens: Math.min(input.maxTokens, 8000),
        messages: [
          { role: "system", content: system },
          { role: "user", content: input.user },
        ],
        ...(strict ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: jsonSchema } } } : {}),
      }),
    }).catch(() => {
      throw new OpenRouterError("Could not reach OpenRouter");
    });
  };
  let response = await call(true);
  if (response.status === 400) response = await call(false);
  const text = await response.text();
  if (!response.ok) throw new OpenRouterError(explain(response.status, text), response.status);
  let content: string | null | undefined;
  try {
    content = (JSON.parse(text) as ChatBody).choices?.[0]?.message?.content;
  } catch {
    throw new OpenRouterError("OpenRouter sent back something unreadable");
  }
  if (!content) throw new OpenRouterError("The model returned an empty answer. Try another model.");
  try {
    return schema.parse(extractJson(content)) as z.infer<T>;
  } catch {
    throw new OpenRouterError("The model did not return the shape we asked for. Try another model.");
  }
}
