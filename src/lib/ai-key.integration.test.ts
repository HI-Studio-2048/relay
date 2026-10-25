import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUserId: async () => "owner-1", requireBotAccess: async () => "owner-1" }));

const params = { params: Promise.resolve({ id: "bot-1" }) };

function put(body: unknown) {
  return new Request("http://localhost/api/bots/bot-1/ai-key", { method: "PUT", body: JSON.stringify(body) });
}

describe("AI key settings route", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-ai-key-")));
    const { getDb } = await import("@/lib/db");
    const { users, bots } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" });
    await db.insert(bots).values({ id: "bot-1", ownerId: "owner-1", name: "Shop", channel: "telegram", tokenEncrypted: "x", webhookSecret: "s", status: "connected" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks an Anthropic key with Anthropic, saves it encrypted, and never returns it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET, PUT } = await import("@/app/api/bots/[id]/ai-key/route");
    const saved = await PUT(put({ provider: "anthropic", apiKey: "sk-ant-goodkey9876", model: "claude-sonnet-5-5" }), params);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ connected: true, provider: "anthropic", model: "claude-sonnet-5-5", hint: "9876" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const status = await (await GET(new Request("http://localhost"), params)).text();
    expect(status).not.toContain("goodkey");

    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, "bot-1"));
    expect(JSON.stringify(row?.settings)).not.toContain("goodkey");
    const { readAiProvider } = await import("@/lib/ai-provider");
    expect(readAiProvider(row?.settings)).toEqual({ kind: "anthropic", apiKey: "sk-ant-goodkey9876", model: "claude-sonnet-5-5" });
  });

  it("changes the model alone, but needs a new key to switch provider", async () => {
    const { PUT } = await import("@/app/api/bots/[id]/ai-key/route");
    const model = await PUT(put({ provider: "anthropic", model: "claude-haiku-5-5" }), params);
    expect(await model.json()).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", hint: "9876" });
    const switched = await PUT(put({ provider: "openai", model: "gpt-5" }), params);
    expect(switched.status).toBe(400);
    expect((await switched.json()).error).toBe("To switch to OpenAI, paste your OpenAI key");
  });

  it("refuses unknown providers, models Recatch cannot run, and keys a provider rejects", async () => {
    const { PUT } = await import("@/app/api/bots/[id]/ai-key/route");
    expect((await PUT(put({ provider: "acme", apiKey: "k" }), params)).status).toBe(400);
    const oldClaude = await PUT(put({ provider: "anthropic", apiKey: "sk-ant-x", model: "claude-2" }), params);
    expect(oldClaude.status).toBe(400);
    expect((await oldClaude.json()).error).toMatch(/Pick one of the Anthropic models/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const rejected = await PUT(put({ provider: "groq", apiKey: "gsk_wrong" }), params);
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toBe("Groq rejected the key. Check it and save it again.");
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const { readAiProvider } = await import("@/lib/ai-provider");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, "bot-1"));
    expect(readAiProvider(row?.settings)?.kind).toBe("anthropic");
  });

  it("removes the key", async () => {
    const { DELETE } = await import("@/app/api/bots/[id]/ai-key/route");
    expect(await (await DELETE(new Request("http://localhost", { method: "DELETE" }), params)).json()).toMatchObject({ connected: false });
  });
});
