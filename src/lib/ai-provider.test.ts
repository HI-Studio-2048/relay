import { afterEach, describe, expect, it, vi } from "vitest";
import { AiUnavailableError, aiConfigured, converse } from "@/lib/ai";
import {
  openRouterStatus,
  readAiProvider,
  verifyOpenRouterKey,
  withOpenRouter,
  withOpenRouterModel,
  withoutOpenRouter,
} from "@/lib/ai-provider";

const contact = { id: "c1", telegramUserId: "t1", username: "sam", firstName: "Sam", lastName: null, email: null, phone: null, customFields: {}, tags: [] };
const input = { settings: {}, brandName: "Shop", contact, history: [{ direction: "inbound" as const, body: "hi" }] };

function chat(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("saved OpenRouter key", () => {
  it("is stored encrypted and only a hint is exposed", () => {
    const settings = withOpenRouter({ ai: { persona: "x" } }, { apiKey: "sk-or-v1-secretvalue1234", model: "" });
    expect(JSON.stringify(settings)).not.toContain("secretvalue");
    expect(settings.ai).toEqual({ persona: "x" });
    expect(openRouterStatus(settings)).toEqual({ connected: true, model: "openai/gpt-4o-mini", hint: "1234" });
    expect(readAiProvider(settings)).toEqual({ kind: "openrouter", apiKey: "sk-or-v1-secretvalue1234", model: "openai/gpt-4o-mini" });
  });

  it("changes the model without touching the key, and can be removed", () => {
    const saved = withOpenRouter({}, { apiKey: "sk-or-v1-abcd", model: "a/b" });
    const swapped = withOpenRouterModel(saved, "c/d");
    expect(readAiProvider(swapped)).toMatchObject({ apiKey: "sk-or-v1-abcd", model: "c/d" });
    expect(readAiProvider(withoutOpenRouter(swapped))).toBeUndefined();
    expect(openRouterStatus(withoutOpenRouter(swapped)).connected).toBe(false);
  });

  it("makes AI available without a server key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    expect(aiConfigured()).toBe(false);
    expect(aiConfigured(readAiProvider(withOpenRouter({}, { apiKey: "k", model: "" })))).toBe(true);
  });

  it("rejects a bad key with a readable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(verifyOpenRouterKey("nope")).rejects.toThrow(/rejected the key/);
  });
});

describe("AI calls through OpenRouter", () => {
  const provider = readAiProvider(withOpenRouter({}, { apiKey: "sk-or-v1-test", model: "vendor/model" }));

  it("sends the key and model, and parses the structured answer", async () => {
    const fetchMock = vi.fn(async () => chat(JSON.stringify({ reply: "Hello Sam", goal_complete: false, handoff: false, collected: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await converse({ ...input, provider });
    expect(result.reply).toBe("Hello Sam");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-or-v1-test");
    expect(JSON.parse(init.body as string).model).toBe("vendor/model");
  });

  it("retries as plain JSON when the model refuses a schema, and unwraps code fences", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
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
