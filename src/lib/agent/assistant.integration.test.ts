import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentComplete, AgentEvent } from "@/lib/agent/run";

let signedIn = "owner-a";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));

const OCTOBER = new Date("2026-10-15T12:00:00Z");

async function readStream(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.slice(6)) as { type: string; text?: string; error?: string });
}

describe("Overview assistant: monthly allowance, templates and setup help", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-assistant-")));
    const { getDb } = await import("@/lib/db");
    const { users, bots } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-a", email: "a@example.test", name: "Ada Lovelace", passwordHash: "x" },
      { id: "owner-new", email: "new@example.test", name: "", passwordHash: "x" },
      { id: "owner-capped", email: "capped@example.test", name: "Cap", passwordHash: "x" },
      { id: "owner-mid", email: "mid@example.test", name: "Mid", passwordHash: "x" },
      { id: "owner-month", email: "month@example.test", name: "Month", passwordHash: "x" },
      { id: "owner-other", email: "other@example.test", name: "Other", passwordHash: "x" },
    ]);
    const base = { tokenEncrypted: "x", webhookSecret: "s", status: "connected" };
    await db.insert(bots).values([
      { ...base, id: "ig", ownerId: "owner-a", name: "Brand", channel: "instagram" },
      { ...base, id: "tg", ownerId: "owner-a", name: "Shop", channel: "telegram", telegramUsername: "shopbot" },
      { ...base, id: "capped-bot", ownerId: "owner-capped", name: "Capped", channel: "telegram" },
      { ...base, id: "other-ig", ownerId: "owner-other", name: "Not yours", channel: "instagram" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    signedIn = "owner-a";
  });

  it("keeps a monthly allowance per login and starts over next month", async () => {
    const { readAssistantBudget, recordAssistantUsage } = await import("@/lib/agent/budget");
    await recordAssistantUsage("owner-month", { costMicros: 3_000_000, inputTokens: 10, outputTokens: 5 }, OCTOBER);
    await recordAssistantUsage("owner-month", { costMicros: 2_500_000, inputTokens: 10, outputTokens: 5 }, OCTOBER);
    const october = await readAssistantBudget("owner-month", OCTOBER);
    expect(october).toMatchObject({ limitUsd: 5, spentUsd: 5.5, remainingUsd: 0, exhausted: true, resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(await readAssistantBudget("owner-month", new Date("2026-11-02T00:00:00Z"))).toMatchObject({ spentUsd: 0, exhausted: false });
    expect(await readAssistantBudget("owner-other", OCTOBER)).toMatchObject({ spentUsd: 0, exhausted: false });

    vi.stubEnv("ASSISTANT_MONTHLY_BUDGET_USD", "10");
    expect(await readAssistantBudget("owner-month", OCTOBER)).toMatchObject({ limitUsd: 10, remainingUsd: 4.5, exhausted: false });
    vi.stubEnv("ASSISTANT_MONTHLY_BUDGET_USD", "0");
    expect(await readAssistantBudget("owner-other", OCTOBER)).toMatchObject({ limitUsd: 0, exhausted: true });

    const { getDb } = await import("@/lib/db");
    const { assistantUsage } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(assistantUsage).where(eq(assistantUsage.ownerId, "owner-month"));
    expect(row).toMatchObject({ period: "2026-10", requests: 2, inputTokens: 20, outputTokens: 10 });
  });

  it("stops before calling Claude once the allowance is used up", async () => {
    const { recordAssistantUsage } = await import("@/lib/agent/budget");
    await recordAssistantUsage("owner-capped", { costMicros: 5_000_000, inputTokens: 1, outputTokens: 1 });
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const complete = vi.fn<AgentComplete>();
    const events: AgentEvent[] = [];
    const result = await runWorkspaceAgent({ ownerId: "owner-capped", history: [], message: "build me a funnel", complete, onEvent: (event) => events.push(event) });
    expect(complete).not.toHaveBeenCalled();
    expect(result.reply).toMatch(/allowance \(\$5\.00\)/);
    expect(events.find((event) => event.type === "budget")).toMatchObject({ budget: { exhausted: true } });
  });

  it("counts what each call cost and stops mid-turn when the cap is reached", async () => {
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const complete = vi.fn<AgentComplete>(async ({ onUsage }) => {
      await onUsage?.({ costMicros: 6_000_000, inputTokens: 100, outputTokens: 50 });
      return { text: "", toolCalls: [{ id: "call-1", name: "list_channels", input: {} }] };
    });
    const result = await runWorkspaceAgent({ ownerId: "owner-mid", history: [], message: "what is connected?", complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.reply).toMatch(/allowance/);
    const { readAssistantBudget } = await import("@/lib/agent/budget");
    expect((await readAssistantBudget("owner-mid")).spentUsd).toBe(6);
  });

  it("never caps or counts a login that pays through its own OpenRouter key", async () => {
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const complete = vi.fn<AgentComplete>(async ({ onUsage }) => {
      expect(onUsage).toBeUndefined();
      return { text: "Still here.", toolCalls: [] };
    });
    const events: AgentEvent[] = [];
    const result = await runWorkspaceAgent({
      ownerId: "owner-capped",
      history: [],
      message: "hi",
      provider: { kind: "openrouter", apiKey: "sk-or-x", model: "x/y" },
      complete,
      onEvent: (event) => events.push(event),
    });
    expect(result.reply).toBe("Still here.");
    expect(events.some((event) => event.type === "budget")).toBe(false);
  });

  it("runs on the account's own Anthropic key, streamed, without touching the allowance", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        requests.push(init);
        const events = [
          { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "On your own key." } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
          { type: "message_stop" },
        ];
        return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
      }),
    );
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    const events: AgentEvent[] = [];
    const result = await runWorkspaceAgent({
      ownerId: "owner-capped",
      history: [],
      message: "hi",
      provider: { kind: "anthropic", apiKey: "sk-ant-own", model: "claude-sonnet-5-5" },
      onEvent: (event) => events.push(event),
    });
    expect(result.reply).toBe("On your own key.");
    expect(new Headers(requests[0]?.headers).get("x-api-key")).toBe("sk-ant-own");
    expect(JSON.parse(requests[0]?.body as string)).toMatchObject({ model: "claude-sonnet-5-5", stream: true, fallbacks: "default" });
    expect(events.some((event) => event.type === "budget")).toBe(false);
  });

  it("answers 429 with the reset date once the allowance is gone, and shows the allowance", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    signedIn = "owner-capped";
    const { POST } = await import("@/app/api/agent/chat/route");
    const refused = await POST(new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify({ message: "hello" }) }));
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as { error: string; budget: { exhausted: boolean } };
    expect(body.error).toMatch(/comes back on [A-Z][a-z]+ 1\./);
    expect(body.budget.exhausted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    const { GET } = await import("@/app/api/agent/route");
    expect(await (await GET()).json()).toMatchObject({ configured: true, billing: "server", budget: { limitUsd: 5, exhausted: true } });
  });

  it("streams a voice turn on the server key and saves it, then starts a new chat", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const sent: { effort?: string; system?: { text: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string));
        const events = [
          { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Open Flows to start." } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
          { type: "message_stop" },
        ];
        return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );
    (globalThis as { relayAnthropic?: unknown }).relayAnthropic = undefined;
    const { POST } = await import("@/app/api/agent/chat/route");
    const response = await POST(new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify({ message: "where do I start?", voice: true }) }));
    expect(response.status).toBe(200);
    const events = await readStream(response);
    expect(events.map((event) => event.type)).toEqual(["delta", "budget", "done"]);
    expect(events[0]?.text).toBe("Open Flows to start.");
    expect((sent[0] as { output_config?: { effort?: string } }).output_config?.effort).toBe("low");
    expect(sent[0]?.system?.[1]?.text).toMatch(/out loud/);
    expect(sent[0]?.system?.[1]?.text).toContain("id ig");

    const { GET, DELETE } = await import("@/app/api/agent/route");
    const before = (await (await GET()).json()) as { messages: { role: string; body: string }[] };
    expect(before.messages.map((message) => message.body)).toEqual(["where do I start?", "Open Flows to start."]);
    await DELETE();
    expect(((await (await GET()).json()) as { messages: unknown[] }).messages).toEqual([]);
    (globalThis as { relayAnthropic?: unknown }).relayAnthropic = undefined;
  });

  it("installs a template as a draft with their keyword, and refuses what cannot work", async () => {
    const { createDraftFlow, createFunnelFromTemplate } = await import("@/lib/agent/tools");
    const { findTemplate } = await import("@/lib/flow-templates");
    const { getDb } = await import("@/lib/db");
    const { flows } = await import("@/lib/db/schema");
    const db = await getDb();

    const made = await createFunnelFromTemplate("owner-a", { botId: "ig", templateId: "comment-lead-magnet", keywords: "FREEBIE" });
    expect(made.draft).toMatchObject({ kind: "flow", botName: "Brand", name: "Comment → DM lead magnet" });
    const [row] = await db.select().from(flows).where(eq(flows.id, made.draft!.id));
    expect(row).toMatchObject({ isActive: false, triggerType: "comment", triggerValue: "FREEBIE", botId: "ig" });
    expect(row?.definition).toEqual(findTemplate("comment-lead-magnet")!.definition);

    const onTelegram = await createFunnelFromTemplate("owner-a", { botId: "tg", templateId: "comment-lead-magnet" });
    expect(onTelegram.draft).toBeUndefined();
    expect(JSON.stringify(onTelegram.output)).toMatch(/Comment triggers only work/);
    const foreign = await createFunnelFromTemplate("owner-a", { botId: "other-ig", templateId: "comment-lead-magnet" });
    expect(JSON.stringify(foreign.output)).toMatch(/not found/);
    const unknown = await createFunnelFromTemplate("owner-a", { botId: "ig", templateId: "nope" });
    expect(JSON.stringify(unknown.output)).toMatch(/list_funnel_templates/);

    const storyOnTelegram = await createDraftFlow("owner-a", {
      botId: "tg",
      name: "Story",
      triggerType: "story_reply",
      steps: [{ id: "s1", type: "end", text: "Thanks!" }],
    });
    expect(JSON.stringify(storyOnTelegram.output)).toMatch(/Story triggers only work on Instagram/);
    const comment = await createDraftFlow("owner-a", {
      botId: "ig",
      name: "Guide",
      triggerType: "comment",
      keywords: "guide",
      publicReplies: ["Sent you a DM 📩", "  "],
      steps: [{ id: "s1", type: "end", text: "Here it is" }],
    });
    const [saved] = await db.select().from(flows).where(eq(flows.id, comment.draft!.id));
    expect((saved?.definition as { trigger?: { publicReplies?: string[] } }).trigger?.publicReplies).toEqual(["Sent you a DM 📩"]);
    expect(saved?.isActive).toBe(false);
  });

  it("opens pages and its own records for them, never someone else's, and says so as it goes", async () => {
    const { getDb } = await import("@/lib/db");
    const { flows } = await import("@/lib/db/schema");
    await (await getDb()).insert(flows).values([
      { id: "mine-flow", botId: "ig", name: "Mine", triggerType: "keyword", triggerValue: "hi", isActive: false, definition: { startStepId: "s1", steps: [{ id: "s1", type: "end", text: "hi" }] } },
      { id: "their-flow", botId: "other-ig", name: "Theirs", triggerType: "keyword", triggerValue: "hi", isActive: false, definition: { startStepId: "s1", steps: [{ id: "s1", type: "end", text: "hi" }] } },
    ]);
    const { runAgentTool } = await import("@/lib/agent/tools");
    expect(await runAgentTool("owner-a", "open_page", { path: "/flows" })).toMatchObject({ navigate: "/flows" });
    expect(await runAgentTool("owner-a", "open_page", { path: "/flows/mine-flow" })).toMatchObject({ navigate: "/flows/mine-flow" });
    const foreign = await runAgentTool("owner-a", "open_page", { path: "/flows/their-flow" });
    expect(foreign.navigate).toBeUndefined();
    expect(JSON.stringify(foreign.output)).toMatch(/Nothing with that id/);
    expect((await runAgentTool("owner-a", "open_page", { path: "https://example.com" })).navigate).toBeUndefined();

    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    let step = 0;
    const complete = vi.fn<AgentComplete>(async () => {
      step += 1;
      return step === 1
        ? { text: "", toolCalls: [{ id: "call-open", name: "open_page", input: { path: "/flows" } }] }
        : { text: "Here are your flows.", toolCalls: [] };
    });
    const events: AgentEvent[] = [];
    await runWorkspaceAgent({ ownerId: "owner-a", history: [], message: "show me my flows", complete, onEvent: (event) => events.push(event) });
    expect(events).toContainEqual({ type: "navigate", href: "/flows" });
  });

  it("walks setup from the checklist, and tells Claude what is connected", async () => {
    const { runAgentTool } = await import("@/lib/agent/tools");
    const progress = (await runAgentTool("owner-a", "get_setup_progress", {})).output as {
      channels: { botId: string; total: number; steps: { label: string; href: string }[] }[];
    };
    expect(progress.channels.map((channel) => channel.botId).sort()).toEqual(["ig", "tg"]);
    expect(progress.channels[0]?.steps.some((step) => step.href === "/ai")).toBe(true);
    const empty = (await runAgentTool("owner-new", "get_setup_progress", {})).output;
    expect(empty).toMatchObject({ channels: [], next: { href: "/channels" } });
    const templates = (await runAgentTool("owner-new", "list_funnel_templates", {})).output as { templates: { id: string }[] };
    expect(templates.templates.map((template) => template.id)).toContain("comment-lead-magnet");

    const { assistantSuggestions, loadAssistantContext } = await import("@/lib/agent/context");
    const context = await loadAssistantContext("owner-a", { voice: true, page: "/flows/abc", now: OCTOBER });
    expect(context).toContain("They are looking at a flow in the editor (/flows/abc) right now.");
    expect(context).toContain("Thursday, October 15, 2026");
    expect(context).toContain("The person signed in is Ada.");
    expect(context).toContain('"Shop" (Telegram, connected, @shopbot, id tg)');
    expect(context).toMatch(/out loud/);
    const fresh = await loadAssistantContext("owner-new");
    expect(fresh).toContain("No channels are connected yet");
    expect(fresh).not.toMatch(/out loud/);
    expect(await assistantSuggestions("owner-new")).toContain("Walk me through getting set up");
    expect(await assistantSuggestions("owner-a")).toContain("Build my first comment-to-DM funnel");
  });
});
