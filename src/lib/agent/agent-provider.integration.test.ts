import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn = "owner-key";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));

type Call = [string, RequestInit];

function openRouterReply(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { "content-type": "application/json" } });
}

/** A streamed Claude answer, the way the assistant now asks for it. */
function anthropicStream(text: string, usage = { input_tokens: 1000, output_tokens: 200 }) {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens } },
    { type: "message_stop" },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function urlOf(input: unknown) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
}

async function readStream(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.slice(6)) as { type: string; text?: string; error?: string });
}

describe("growth agent provider and limits", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-agent-provider-")));
    const { getDb } = await import("@/lib/db");
    const { users, bots } = await import("@/lib/db/schema");
    const { withOpenRouter } = await import("@/lib/ai-provider");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-key", email: "key@example.test", name: "Key", passwordHash: "x" },
      { id: "owner-nokey", email: "nokey@example.test", name: "No key", passwordHash: "x" },
      { id: "owner-other", email: "other@example.test", name: "Other", passwordHash: "x" },
    ]);
    const base = { channel: "telegram", tokenEncrypted: "x", webhookSecret: "s", status: "connected" };
    await db.insert(bots).values([
      { ...base, id: "plain", ownerId: "owner-key", name: "Plain", updatedAt: new Date("2026-10-18T00:00:00Z") },
      {
        ...base,
        id: "old-key",
        ownerId: "owner-key",
        name: "Old key",
        settings: withOpenRouter({}, { apiKey: "sk-or-old", model: "old/model" }),
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        ...base,
        id: "new-key",
        ownerId: "owner-key",
        name: "New key",
        settings: withOpenRouter({}, { apiKey: "sk-or-new", model: "vendor/tool-model" }),
        updatedAt: new Date("2026-10-10T00:00:00Z"),
      },
      { ...base, id: "nokey-bot", ownerId: "owner-nokey", name: "Shop" },
      {
        ...base,
        id: "other-bot",
        ownerId: "owner-other",
        name: "Not yours",
        settings: withOpenRouter({}, { apiKey: "sk-or-other", model: "x/y" }),
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    signedIn = "owner-key";
  });

  it("picks the most recently updated bot with a key, and never another login's", async () => {
    const { workspaceAiProvider } = await import("@/lib/agent/provider");
    expect(await workspaceAiProvider("owner-key")).toEqual({ kind: "openrouter", apiKey: "sk-or-new", model: "vendor/tool-model" });
    expect(await workspaceAiProvider("owner-nokey")).toBeUndefined();
  });

  it("runs the tool loop through OpenRouter and never calls Anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openRouterReply({
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "list_channels", arguments: "{}" } }],
        }),
      )
      .mockResolvedValueOnce(openRouterReply({ content: "You have three channels connected." }));
    vi.stubGlobal("fetch", fetchMock);
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const { workspaceAiProvider } = await import("@/lib/agent/provider");
    const provider = await workspaceAiProvider("owner-key");
    const events: string[] = [];
    const result = await runWorkspaceAgent({
      ownerId: "owner-key",
      history: [],
      message: "what is connected?",
      provider,
      onEvent: (event) => events.push(event.type),
    });
    expect(result.reply).toBe("You have three channels connected.");
    expect(events).toContain("status");
    const calls = fetchMock.mock.calls as unknown as Call[];
    expect(calls).toHaveLength(2);
    for (const [url, init] of calls) {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-or-new");
    }
    const first = JSON.parse(calls[0][1].body as string);
    expect(first.model).toBe("vendor/tool-model");
    expect(first.messages[0].role).toBe("system");
    expect(first.tools.map((tool: { function: { name: string } }) => tool.function.name)).toContain("create_draft_flow");
    const second = JSON.parse(calls[1][1].body as string);
    const assistant = second.messages.find((message: { role: string }) => message.role === "assistant");
    expect(assistant.tool_calls[0]).toMatchObject({ id: "call_1", function: { name: "list_channels" } });
    const tool = second.messages.find((message: { role: string }) => message.role === "tool");
    expect(tool.tool_call_id).toBe("call_1");
    expect(tool.content).toContain("Plain");
    expect(tool.content).not.toContain("Not yours");
  });

  it("falls back to the server key when no account has an OpenRouter key, streams, and counts the cost", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    (globalThis as { relayAnthropic?: unknown }).relayAnthropic = undefined;
    const fetchMock = vi.fn(async () => anthropicStream("Hello from Claude"));
    vi.stubGlobal("fetch", fetchMock);
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const { workspaceAiProvider } = await import("@/lib/agent/provider");
    const provider = await workspaceAiProvider("owner-nokey");
    const deltas: string[] = [];
    const result = await runWorkspaceAgent({
      ownerId: "owner-nokey",
      history: [],
      message: "hi",
      provider,
      context: "Workspace facts: none",
      onEvent: (event) => {
        if (event.type === "delta") deltas.push(event.text);
      },
    });
    expect(result.reply).toBe("Hello from Claude");
    expect(deltas.join("")).toBe("Hello from Claude");
    const calls = fetchMock.mock.calls as unknown as Call[];
    expect(calls.length).toBe(1);
    expect(calls.every(([input]) => urlOf(input).startsWith("https://api.anthropic.com/"))).toBe(true);
    const [, init] = calls[0];
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default", cache_control: { type: "ephemeral" }, output_config: { effort: "medium" } });
    expect(sent.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sent.system[1].text).toBe("Workspace facts: none");
    expect(sent.tools.map((tool: { name: string }) => tool.name)).toContain("create_funnel_from_template");
    expect(new Headers(init.headers).get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const { readAssistantBudget } = await import("@/lib/agent/budget");
    // 1,000 input tokens at $4 and 200 output tokens at $20 per million.
    expect((await readAssistantBudget("owner-nokey")).spentUsd).toBeCloseTo(0.008, 6);
    (globalThis as { relayAnthropic?: unknown }).relayAnthropic = undefined;
  });

  it("shows as configured from an OpenRouter key alone, and off with neither", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const { GET } = await import("@/app/api/agent/route");
    expect(await (await GET()).json()).toMatchObject({ configured: true });
    signedIn = "owner-nokey";
    expect(await (await GET()).json()).toMatchObject({ configured: false });
    const { POST } = await import("@/app/api/agent/chat/route");
    const refused = await POST(new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) }));
    expect(refused.status).toBe(503);
  });

  it("streams a chat turn on the account key, then answers 429 past the hourly limit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const fetchMock = vi.fn(async () => openRouterReply({ content: "Hi there." }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/chat/route");
    const send = () => POST(new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify({ message: "hello" }) }));

    const ok = await send();
    expect(ok.status).toBe(200);
    const events = await readStream(ok);
    expect(events.map((event) => event.type)).toEqual(["delta", "done"]);
    expect(urlOf((fetchMock.mock.calls as unknown as Call[])[0][0])).toBe("https://openrouter.ai/api/v1/chat/completions");

    const { allowAttempt } = await import("@/lib/rate-limit");
    for (let index = 0; index < 29; index += 1) await allowAttempt("agent-chat:owner-key", 30, 3600);
    const { getDb } = await import("@/lib/db");
    const { agentMessages } = await import("@/lib/db/schema");
    const db = await getDb();
    const before = await db.select().from(agentMessages).where(eq(agentMessages.ownerId, "owner-key"));
    fetchMock.mockClear();

    const limited = await send();
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/limit/);
    expect(fetchMock).not.toHaveBeenCalled();
    const after = await db.select().from(agentMessages).where(eq(agentMessages.ownerId, "owner-key"));
    expect(after).toHaveLength(before.length);
  });
});
