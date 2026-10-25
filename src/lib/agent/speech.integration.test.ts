import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn = "owner-server";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));

type Call = [string, RequestInit];

function speechRequest(body: Record<string, unknown>) {
  return new Request("http://local.test/api/agent/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mp3() {
  return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200, headers: { "content-type": "audio/mpeg" } });
}

async function spentMicros(ownerId: string) {
  const { getDb } = await import("@/lib/db");
  const { assistantUsage } = await import("@/lib/db/schema");
  const [row] = await (await getDb()).select().from(assistantUsage).where(eq(assistantUsage.ownerId, ownerId));
  return row ? { costMicros: Number(row.costMicros), requests: row.requests } : null;
}

describe("assistant natural voice", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-speech-")));
    const { getDb } = await import("@/lib/db");
    const { users, bots } = await import("@/lib/db/schema");
    const { withAiKey } = await import("@/lib/ai-provider");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-server", email: "server@example.test", name: "Server", passwordHash: "x" },
      { id: "owner-openai", email: "openai@example.test", name: "Own", passwordHash: "x" },
      { id: "owner-claude", email: "claude@example.test", name: "Claude key", passwordHash: "x" },
      { id: "owner-capped", email: "capped@example.test", name: "Capped", passwordHash: "x" },
      { id: "owner-broken", email: "broken@example.test", name: "Broken", passwordHash: "x" },
    ]);
    const base = { channel: "telegram", tokenEncrypted: "x", webhookSecret: "s", status: "connected" };
    await db.insert(bots).values([
      { ...base, id: "own-openai", ownerId: "owner-openai", name: "Own", settings: withAiKey({}, { provider: "openai", apiKey: "sk-own-openai", model: "gpt-5" }) },
      { ...base, id: "own-claude", ownerId: "owner-claude", name: "Claude", settings: withAiKey({}, { provider: "anthropic", apiKey: "sk-ant-own", model: "claude-opus-5-5" }) },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    signedIn = "owner-server";
  });

  it("speaks on the company key and counts it against the login's allowance", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    const text = "I saved it as a draft. Want me to turn it on?";
    const response = await POST(speechRequest({ text, voice: "cedar" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb, 0x90, 0x00]));

    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-company");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "gpt-4o-mini-tts", voice: "cedar", input: text, response_format: "mp3" });
    expect(body.instructions).toMatch(/warm/);

    const { SPEECH_MICROS_PER_CHAR } = await import("@/lib/agent/pricing");
    expect(await spentMicros("owner-server")).toEqual({ costMicros: text.length * SPEECH_MICROS_PER_CHAR, requests: 1 });
  });

  it("falls back to the default voice for a name it doesn't know", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    await POST(speechRequest({ text: "Hello there.", voice: "robot-9000" }));
    const [, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(JSON.parse(String(init.body)).voice).toBe("marin");
  });

  it("uses the account's own OpenAI key and never counts it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    signedIn = "owner-openai";
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    expect((await POST(speechRequest({ text: "On your own key." }))).status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-own-openai");
    expect(await spentMicros("owner-openai")).toBeNull();
  });

  it("speaks on the company key for an account whose own key isn't OpenAI, and counts it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    signedIn = "owner-claude";
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    expect((await POST(speechRequest({ text: "Counted." }))).status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-company");
    expect(await spentMicros("owner-claude")).toMatchObject({ requests: 1 });
  });

  it("answers 503 without any OpenAI key, so the browser speaks", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    expect((await POST(speechRequest({ text: "Hello." }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at 429 once the month's allowance is used up", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    signedIn = "owner-capped";
    const { recordAssistantUsage } = await import("@/lib/agent/budget");
    await recordAssistantUsage("owner-capped", { costMicros: 5_000_000, inputTokens: 1, outputTokens: 1 });
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/speech/route");
    const response = await POST(speechRequest({ text: "Hello." }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/allowance/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("charges nothing when OpenAI fails, and refuses empty text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    signedIn = "owner-broken";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 500 })));
    const { POST } = await import("@/app/api/agent/speech/route");
    expect((await POST(speechRequest({ text: "Hello." }))).status).toBe(502);
    expect((await POST(speechRequest({ text: "   " }))).status).toBe(400);
    expect(await spentMicros("owner-broken")).toBeNull();
  });

  it("tells the browser whether the natural voice is on", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await import("@/app/api/agent/route");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await (await GET()).json()).naturalVoice).toBe(false);
    signedIn = "owner-openai";
    expect((await (await GET()).json()).naturalVoice).toBe(true);
    signedIn = "owner-server";
    vi.stubEnv("OPENAI_API_KEY", "sk-company");
    expect((await (await GET()).json()).naturalVoice).toBe(true);
  });
});
