import { afterEach, describe, expect, it, vi } from "vitest";
import { AiUnavailableError, aiConfigured, converse } from "@/lib/ai";
import { aiKeyStatus, readAiProvider, verifyAiKey, withAiKey, withAiKeyModel, withoutAiKey } from "@/lib/ai-provider";
import { encryptSecret } from "@/lib/crypto";

const contact = { id: "c1", telegramUserId: "t1", username: "sam", firstName: "Sam", lastName: null, email: null, phone: null, customFields: {}, tags: [] };
const input = { settings: {}, brandName: "Shop", contact, history: [{ direction: "inbound" as const, body: "hi" }] };
const ANSWER = { reply: "Hello Sam", goal_complete: false, handoff: false, collected: [] };

function chat(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

function claudeMessage(text: string, model: string) {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function urlOf(input: unknown) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("saved AI keys", () => {
  it("are stored encrypted with only a hint exposed, for any provider", () => {
    const settings = withAiKey({ ai: { persona: "x" } }, { provider: "anthropic", apiKey: "sk-ant-secretvalue1234", model: "claude-sonnet-5-5" });
    expect(JSON.stringify(settings)).not.toContain("secretvalue");
    expect(settings.ai).toEqual({ persona: "x" });
    expect(aiKeyStatus(settings)).toEqual({ connected: true, provider: "anthropic", model: "claude-sonnet-5-5", hint: "1234" });
    expect(readAiProvider(settings)).toEqual({ kind: "anthropic", apiKey: "sk-ant-secretvalue1234", model: "claude-sonnet-5-5" });
  });

  it("keeps an OpenRouter key saved before other providers existed, and replaces it on the next save", () => {
    const old = { openrouter: { key: encryptSecret("sk-or-v1-old1"), model: "a/b", hint: "old1" } };
    expect(readAiProvider(old)).toEqual({ kind: "openrouter", apiKey: "sk-or-v1-old1", model: "a/b" });
    expect(aiKeyStatus(old)).toMatchObject({ connected: true, provider: "openrouter", hint: "old1" });
    const replaced = withAiKey(old, { provider: "openai", apiKey: "sk-new2", model: "gpt-5" });
    expect(replaced.openrouter).toBeUndefined();
    expect(readAiProvider(replaced)).toEqual({ kind: "openai", apiKey: "sk-new2", model: "gpt-5" });
  });

  it("only takes Claude models Recatch can run on an Anthropic key, and any well-formed id elsewhere", () => {
    expect(readAiProvider(withAiKey({}, { provider: "anthropic", apiKey: "k", model: "claude-2" }))?.model).toBe("claude-opus-5-5");
    expect(readAiProvider(withAiKey({}, { provider: "anthropic", apiKey: "k", model: "" }))?.model).toBe("claude-opus-5-5");
    expect(readAiProvider(withAiKey({}, { provider: "google", apiKey: "k", model: "gemini-9-ultra" }))?.model).toBe("gemini-9-ultra");
    expect(readAiProvider(withAiKey({}, { provider: "groq", apiKey: "k", model: "bad model id!" }))?.model).toBe("llama-3.3-70b-versatile");
  });

  it("changes the model without touching the key, and can be removed", () => {
    const saved = withAiKey({}, { provider: "openrouter", apiKey: "sk-or-v1-abcd", model: "a/b" });
    const swapped = withAiKeyModel(saved, "c/d");
    expect(readAiProvider(swapped)).toMatchObject({ kind: "openrouter", apiKey: "sk-or-v1-abcd", model: "c/d" });
    expect(readAiProvider(withoutAiKey(swapped))).toBeUndefined();
    expect(aiKeyStatus(withoutAiKey(swapped)).connected).toBe(false);
    const legacyOnly = { openrouter: { key: encryptSecret("x"), model: "a/b", hint: "x" } };
    expect(readAiProvider(withoutAiKey(legacyOnly))).toBeUndefined();
  });

  it("makes AI available without a server key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    expect(aiConfigured()).toBe(false);
    expect(aiConfigured(readAiProvider(withAiKey({}, { provider: "deepseek", apiKey: "k", model: "" })))).toBe(true);
  });
});

describe("checking a key before it is saved", () => {
  it("asks each provider in its own way and explains a refusal", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyAiKey("openrouter", "nope")).rejects.toThrow("OpenRouter rejected the key");
    const calls = fetchMock.mock.calls as unknown as [unknown, RequestInit][];
    expect(urlOf(calls[0]![0])).toBe("https://openrouter.ai/api/v1/key");
    await expect(verifyAiKey("xai", "nope")).rejects.toThrow("xAI rejected the key");
    expect(urlOf(calls[1]![0])).toBe("https://api.x.ai/v1/models");

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await verifyAiKey("openai", "sk-good");
    const [url, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-good");
  });

  it("checks an Anthropic key with Anthropic itself, never with the server's key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyAiKey("anthropic", "sk-ant-wrong")).rejects.toThrow("Anthropic rejected the key");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(urlOf(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect(new Headers(init.headers).get("x-api-key")).toBe("sk-ant-wrong");
  });
});

describe("AI calls on an OpenAI-compatible key", () => {
  const provider = readAiProvider(withAiKey({}, { provider: "openrouter", apiKey: "sk-or-v1-test", model: "vendor/model" }));

  it("sends the key and model, and parses the structured answer", async () => {
    const fetchMock = vi.fn(async () => chat(JSON.stringify(ANSWER)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await converse({ ...input, provider });
    expect(result.reply).toBe("Hello Sam");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-or-v1-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("vendor/model");
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it("goes to each provider's own address, with OpenAI's token limit field", async () => {
    const fetchMock = vi.fn(async () => chat(JSON.stringify(ANSWER)));
    vi.stubGlobal("fetch", fetchMock);
    await converse({ ...input, provider: readAiProvider(withAiKey({}, { provider: "openai", apiKey: "sk-o", model: "gpt-5-mini" })) });
    await converse({ ...input, provider: readAiProvider(withAiKey({}, { provider: "google", apiKey: "AIza-g", model: "gemini-2.5-flash" })) });
    const [openaiUrl, openaiInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(openaiUrl).toBe("https://api.openai.com/v1/chat/completions");
    const openaiBody = JSON.parse(openaiInit.body as string);
    expect(openaiBody.max_completion_tokens).toBeGreaterThan(0);
    expect(openaiBody.max_tokens).toBeUndefined();
    expect((openaiInit.headers as Record<string, string>)["x-title"]).toBeUndefined();
    const [googleUrl, googleInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(googleUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(JSON.parse(googleInit.body as string).model).toBe("gemini-2.5-flash");
  });

  it("retries as plain JSON when the model refuses a schema, and unwraps code fences", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 422 }))
      .mockResolvedValueOnce(chat('```json\n{"reply":"Hi","goal_complete":false,"handoff":true,"collected":[]}\n```'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await converse({ ...input, provider });
    expect(result).toMatchObject({ reply: "Hi", handoff: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).response_format).toBeUndefined();
  });

  it("puts the account's standing instructions in the system prompt", async () => {
    const fetchMock = vi.fn(async () => chat(JSON.stringify({ reply: "Hola", goal_complete: false, handoff: false, collected: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await converse({ ...input, settings: { instructions: "Always reply in Spanish." }, provider });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain("Standing instructions from the business");
    expect(body.messages[0].content).toContain("Always reply in Spanish.");
  });

  it("turns provider failures into AiUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 402 })));
    await expect(converse({ ...input, provider })).rejects.toThrow(AiUnavailableError);
    vi.stubGlobal("fetch", vi.fn(async () => chat("not json at all")));
    await expect(converse({ ...input, provider })).rejects.toThrow(/Try another model/);
  });
});

describe("AI calls on the account's own Anthropic key", () => {
  it("call Claude with the account's key and model, not the server's", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const fetchMock = vi.fn(async () => claudeMessage(JSON.stringify(ANSWER), "claude-sonnet-5-5"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = readAiProvider(withAiKey({}, { provider: "anthropic", apiKey: "sk-ant-mine", model: "claude-sonnet-5-5" }));
    const result = await converse({ ...input, provider });
    expect(result.reply).toBe("Hello Sam");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(urlOf(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-mine");
    expect(headers.get("authorization")).toBeNull();
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default" });
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("leave refusal fallbacks off for a model that does not take them", async () => {
    const fetchMock = vi.fn(async () => claudeMessage(JSON.stringify(ANSWER), "claude-haiku-5-5"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = readAiProvider(withAiKey({}, { provider: "anthropic", apiKey: "sk-ant-mine", model: "claude-haiku-5-5" }));
    await converse({ ...input, provider });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.fallbacks).toBeUndefined();
    expect(new Headers(init.headers).get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("explains a rejected key instead of failing quietly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const provider = readAiProvider(withAiKey({}, { provider: "anthropic", apiKey: "sk-ant-old", model: "claude-opus-5-5" }));
    await expect(converse({ ...input, provider })).rejects.toThrow(/Anthropic rejected the key/);
    await expect(converse({ ...input, provider })).rejects.toThrow(AiUnavailableError);
  });
});
