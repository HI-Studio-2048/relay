import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { isAiVendor, pickModel, vendorInfo, type AiKeyStatus, type AiVendor } from "@/lib/ai-vendors";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";

/**
 * Bring-your-own-key AI. An account that saves its own key (Anthropic, OpenAI, Google Gemini, xAI,
 * Mistral, Groq, DeepSeek or OpenRouter, see ai-vendors.ts) sends its AI calls there, so the customer
 * pays for their own usage and picks the model. Without a key the server's Anthropic key (if set) is
 * used. The key lives encrypted in bots.settings.aiKey, apart from settings.ai, so the AI settings the
 * browser reads never carry it. Keys saved before other providers existed sit in settings.openrouter
 * and still work.
 */
export type AiProvider = { kind: AiVendor; apiKey: string; model: string };

type StoredKey = { provider: AiVendor; key: string; model: string; hint: string };
type RawSettings = Record<string, unknown> | null | undefined;

/** The providers that speak OpenAI's chat completions format, and how to reach each one. */
const COMPATIBLE: Record<Exclude<AiVendor, "anthropic">, { baseUrl: string; tokens: "max_tokens" | "max_completion_tokens"; verify: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", tokens: "max_completion_tokens", verify: "/models" },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", tokens: "max_tokens", verify: "/models" },
  xai: { baseUrl: "https://api.x.ai/v1", tokens: "max_tokens", verify: "/models" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", tokens: "max_tokens", verify: "/models" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", tokens: "max_tokens", verify: "/models" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", tokens: "max_tokens", verify: "/models" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", tokens: "max_tokens", verify: "/key" },
};

/** Why a call with the account's own key failed, phrased for the person who owns the key. */
export class AiKeyError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiKeyError";
  }
}

function stored(settings: RawSettings): StoredKey | null {
  const raw = settings?.aiKey as Partial<StoredKey> | undefined;
  if (raw && typeof raw.key === "string" && raw.key && isAiVendor(raw.provider)) {
    return { provider: raw.provider, key: raw.key, model: pickModel(raw.provider, raw.model), hint: raw.hint ?? "" };
  }
  // Saved before other providers existed.
  const legacy = settings?.openrouter as Partial<StoredKey> | undefined;
  if (legacy && typeof legacy.key === "string" && legacy.key) {
    return { provider: "openrouter", key: legacy.key, model: pickModel("openrouter", legacy.model), hint: legacy.hint ?? "" };
  }
  return null;
}

/** The provider to call for this account, or undefined to fall back to the server's own key. */
export function readAiProvider(settings: RawSettings): AiProvider | undefined {
  const row = stored(settings);
  if (!row) return undefined;
  try {
    return { kind: row.provider, apiKey: decryptSecret(row.key), model: row.model };
  } catch {
    // Saved under an older ENCRYPTION_KEY. Treat it as not connected so the page asks for the key again.
    return undefined;
  }
}

/** What the browser may know: whether a key is saved, for which provider, its last four characters and the model. Never the key. */
export function aiKeyStatus(settings: RawSettings): AiKeyStatus {
  const row = stored(settings);
  return row
    ? { connected: true, provider: row.provider, model: row.model, hint: row.hint }
    : { connected: false, provider: "anthropic", model: vendorInfo("anthropic").defaultModel, hint: "" };
}

function withoutKeys(settings: RawSettings): Record<string, unknown> {
  const rest = { ...(settings ?? {}) };
  delete rest.aiKey;
  delete rest.openrouter;
  return rest;
}

export function withAiKey(settings: RawSettings, input: { provider: AiVendor; apiKey: string; model: string }): Record<string, unknown> {
  const apiKey = input.apiKey.trim();
  const row: StoredKey = { provider: input.provider, key: encryptSecret(apiKey), model: pickModel(input.provider, input.model), hint: apiKey.slice(-4) };
  return { ...withoutKeys(settings), aiKey: row };
}

export function withoutAiKey(settings: RawSettings): Record<string, unknown> {
  return withoutKeys(settings);
}

export function withAiKeyModel(settings: RawSettings, model: string): Record<string, unknown> {
  const row = stored(settings);
  if (!row) return { ...(settings ?? {}) };
  return { ...withoutKeys(settings), aiKey: { ...row, model: pickModel(row.provider, model) } };
}

/** A Claude client on the account's own key. Never the server's credentials, even when they are set. */
export function anthropicClientFor(apiKey: string) {
  return new Anthropic({ apiKey, authToken: null });
}

/** The account's own Anthropic key failing, in words its owner can act on. Other errors pass through. */
export function anthropicKeyError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return new AiKeyError("Anthropic rejected the key. Check it and save it again.", 401);
  if (error instanceof Anthropic.PermissionDeniedError) return new AiKeyError("That Anthropic key is not allowed to use this model.", 403);
  if (error instanceof Anthropic.RateLimitError) return new AiKeyError("Anthropic is rate limiting this key. Try again in a moment.", 429);
  if (error instanceof Anthropic.APIConnectionError) return new AiKeyError("Could not reach Anthropic");
  if (error instanceof Anthropic.APIError && typeof error.status === "number" && error.status < 500) {
    return new AiKeyError(`Anthropic returned ${error.status}: ${error.message.slice(0, 200)}`, error.status);
  }
  return error;
}

function headers(vendor: AiVendor, apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...(vendor === "openrouter" ? { "http-referer": publicUrl() ?? "https://recatch.app", "x-title": "Recatch" } : {}),
  };
}

function explain(vendor: AiVendor, status: number, body: string) {
  const name = vendorInfo(vendor).label.replace(/ \(.*\)$/, "");
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | unknown[] } | { error?: unknown }[];
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
    const message = error && typeof error === "object" && "message" in error ? (error as { message?: unknown }).message : undefined;
    if (typeof message === "string") detail = `: ${message.slice(0, 200)}`;
  } catch {
    // Not JSON, keep the status only.
  }
  if (status === 401 || status === 403) return `${name} rejected the key. Check it and save it again.`;
  if (status === 402) return `Your ${name} account is out of credits.`;
  if (status === 429) return `${name} is rate limiting this key${detail || ". Try again in a moment."}`;
  return `${name} returned ${status}${detail}`;
}

/** Throws AiKeyError when the key is not accepted. Used when saving, so a typo is caught straight away. */
export async function verifyAiKey(vendor: AiVendor, apiKey: string) {
  if (vendor === "anthropic") {
    try {
      await anthropicClientFor(apiKey).models.list({ limit: 1 });
    } catch (error) {
      const explained = anthropicKeyError(error);
      throw explained instanceof AiKeyError ? explained : new AiKeyError("Could not check the key with Anthropic");
    }
    return;
  }
  const target = COMPATIBLE[vendor];
  const name = vendorInfo(vendor).label.replace(/ \(.*\)$/, "");
  const response = await fetch(`${target.baseUrl}${target.verify}`, { headers: headers(vendor, apiKey), signal: AbortSignal.timeout(15_000) }).catch(() => {
    throw new AiKeyError(`Could not reach ${name} to check the key`);
  });
  if (!response.ok) throw new AiKeyError(explain(vendor, response.status, await response.text().catch(() => "")), response.status);
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}

type ChatBody = { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };

/** OpenAI-style chat message, the shape these providers take for tool calling. */
export type CompatibleMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type CompatibleTool = { type: "function"; function: { name: string; description: string; parameters: unknown } };

type ToolChatBody = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

function chatRequest(provider: AiProvider, body: Record<string, unknown>, maxTokens: number) {
  const target = COMPATIBLE[provider.kind as Exclude<AiVendor, "anthropic">];
  const name = vendorInfo(provider.kind).label.replace(/ \(.*\)$/, "");
  return fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(provider.kind, provider.apiKey),
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model: provider.model, [target.tokens]: Math.min(maxTokens, 8000), ...body }),
  }).catch(() => {
    throw new AiKeyError(`Could not reach ${name}`);
  });
}

/**
 * One tool-calling turn through an OpenAI-compatible provider. Returns the text and the tool calls the
 * model asked for, with arguments parsed. Arguments that are not valid JSON come back as {} so the tool
 * reports a validation error to the model instead of the whole turn failing.
 */
export async function compatibleToolTurn(
  provider: AiProvider,
  input: { messages: CompatibleMessage[]; tools: CompatibleTool[]; maxTokens: number },
): Promise<{ text: string; toolCalls: { id: string; name: string; input: unknown }[] }> {
  const response = await chatRequest(provider, { messages: input.messages, tools: input.tools }, input.maxTokens);
  const text = await response.text();
  if (!response.ok) throw new AiKeyError(explain(provider.kind, response.status, text), response.status);
  let message: NonNullable<NonNullable<ToolChatBody["choices"]>[number]["message"]> | undefined;
  try {
    message = (JSON.parse(text) as ToolChatBody).choices?.[0]?.message;
  } catch {
    throw new AiKeyError("The AI provider sent back something unreadable");
  }
  if (!message) throw new AiKeyError("The model returned an empty answer. Try another model.");
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

/** One structured completion through an OpenAI-compatible provider. Models differ in schema support, so a refusal of the schema retries as plain JSON. */
export async function compatibleParse<T extends z.ZodType>(
  provider: AiProvider,
  schema: T,
  input: { system: string; user: string; maxTokens: number },
): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema);
  const call = (strict: boolean) => {
    const system = strict ? input.system : `${input.system}\n\nReply with only a JSON object matching this JSON Schema, no other text:\n${JSON.stringify(jsonSchema)}`;
    return chatRequest(
      provider,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: input.user },
        ],
        ...(strict ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: jsonSchema } } } : {}),
      },
      input.maxTokens,
    );
  };
  let response = await call(true);
  if (response.status === 400 || response.status === 422) response = await call(false);
  const text = await response.text();
  if (!response.ok) throw new AiKeyError(explain(provider.kind, response.status, text), response.status);
  let content: string | null | undefined;
  try {
    content = (JSON.parse(text) as ChatBody).choices?.[0]?.message?.content;
  } catch {
    throw new AiKeyError("The AI provider sent back something unreadable");
  }
  if (!content) throw new AiKeyError("The model returned an empty answer. Try another model.");
  try {
    return schema.parse(extractJson(content)) as z.infer<T>;
  } catch {
    throw new AiKeyError("The model did not return the shape we asked for. Try another model.");
  }
}
