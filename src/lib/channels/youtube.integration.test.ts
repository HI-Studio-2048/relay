import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUserId: async () => "owner-1",
  requireBotAccess: async () => undefined,
}));

const CHANNEL = "UC-studio";
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

type Hit = { url: URL; method: string; body: string; auth: string | null };
const hits: Hit[] = [];
const realFetch = globalThis.fetch;

/** What the fake YouTube holds: comment threads newest first, and what Recatch posted or held. */
const world = {
  threads: [] as Record<string, unknown>[],
  replies: [] as { parentId: string; textOriginal: string }[],
  held: [] as string[],
};

const thread = (id: string, text: string, publishedAt: string, author = "UC-bea", name = "Bea Smith") => ({
  id: `thread-${id}`,
  snippet: {
    videoId: "vid-1",
    topLevelComment: {
      id: `comment-${id}`,
      snippet: { videoId: "vid-1", textOriginal: text, publishedAt, authorDisplayName: name, authorProfileImageUrl: "https://img/bea.png", authorChannelId: { value: author } },
    },
  },
});

/** Google's sign-in and the parts of the YouTube Data API Recatch calls. */
function fakeGoogle() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.host.endsWith("googleapis.com")) return realFetch(input, init);
    const body = init?.body ? String(init.body) : "";
    hits.push({ url, method: init?.method ?? "GET", body, auth: new Headers(init?.headers).get("authorization") });
    if (url.pathname === "/token") return respond({ access_token: "G-AT", refresh_token: "G-RT", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.force-ssl" });
    if (url.pathname === "/revoke") return respond({});
    if (url.pathname === "/youtube/v3/channels") return respond({ items: [{ id: CHANNEL, snippet: { title: "Studio Channel" } }] });
    if (url.pathname === "/youtube/v3/commentThreads") {
      if (url.searchParams.get("allThreadsRelatedToChannelId") !== CHANNEL) return respond({ error: { message: "wrong channel" } }, 400);
      return respond({ items: world.threads });
    }
    if (url.pathname === "/youtube/v3/comments" && init?.method === "POST") {
      const snippet = (JSON.parse(body) as { snippet: { parentId: string; textOriginal: string } }).snippet;
      world.replies.push(snippet);
      return respond({ id: `reply-${world.replies.length}`, snippet });
    }
    if (url.pathname === "/youtube/v3/comments/setModerationStatus") {
      world.held.push(url.searchParams.get("id")!);
      return new Response(null, { status: 204 });
    }
    return respond({ error: { message: "unexpected" } }, 404);
  });
}

describe("YouTube comments through the whole app", () => {
  let botId = "";

  const currentRow = async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, botId));
    return row!;
  };

  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-youtube-")));
    vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeGoogle());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    await (await getDb()).insert(users).values({ id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks Google for the scope that can reply, and signing in makes a YouTube channel", async () => {
    const { GET: start } = await import("@/app/api/connections/[provider]/start/route");
    const { GET: callback } = await import("@/app/api/connections/[provider]/callback/route");
    const ctx = { params: Promise.resolve({ provider: "google" }) };
    const began = await start(new Request("https://recatch.test/api/connections/google/start"), ctx);
    const target = new URL(began.headers.get("location")!, "https://recatch.test");
    expect(target.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.force-ssl");
    const cookie = (began.headers.get("set-cookie") ?? "").split(";")[0];
    const state = encodeURIComponent(target.searchParams.get("state")!);
    const returned = await callback(new Request(`https://recatch.test/api/connections/google/callback?code=C&state=${state}`, { headers: { cookie } }), ctx);
    expect(new URL(returned.headers.get("location")!, "https://recatch.test").searchParams.get("connected")).toBe("YouTube connected: Studio Channel");

    const { listBots } = await import("@/lib/bots");
    const [bot] = (await listBots("owner-1")).filter((item) => item.channel === "youtube");
    expect(bot).toMatchObject({ name: "Studio Channel (YouTube)", status: "connected" });
    botId = bot!.id;
    expect((await currentRow()).externalAccountId).toBe(CHANNEL);
  });

  it("only records where things stand on the first look", async () => {
    const { pollYouTubeChannel } = await import("@/lib/channels/youtube-manager");
    world.threads = [thread("old", "guide please", "2026-01-01T00:00:00Z")];
    await pollYouTubeChannel(await currentRow());
    expect((await currentRow()).settings?.youtubeCommentsSince).toBe("2026-01-01T00:00:00Z");
    expect(world.replies).toHaveLength(0);
    const call = hits.find((hit) => hit.url.pathname === "/youtube/v3/commentThreads")!;
    expect(call.auth).toBe("Bearer G-AT");
  });

  it("answers a new comment with a public reply, holds a moderated one, and skips the channel's own", async () => {
    const { pollYouTubeChannel } = await import("@/lib/channels/youtube-manager");
    const { getDb } = await import("@/lib/db");
    const { bots, contacts, flows, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.update(bots).set({ settings: { ...(await currentRow()).settings, moderation: { enabled: true, words: ["scam"], hideLinks: false } } }).where(eq(bots.id, botId));
    await db.insert(flows).values({
      id: "flow-yt",
      botId,
      name: "Guide on comment",
      triggerType: "comment",
      triggerValue: "guide",
      isActive: true,
      definition: { startStepId: "s1", steps: [{ id: "s1", type: "text", text: "This never posts" }], trigger: { publicReplies: ["Link's in the description, {{first_name}}"] } },
    });

    world.threads = [
      thread("own", "guide is pinned", "2026-01-01T00:04:00Z", CHANNEL, "Studio Channel"),
      thread("spam", "total scam, guide", "2026-01-01T00:03:00Z", "UC-sam", "Sam"),
      thread("new", "where is the guide?", "2026-01-01T00:02:00Z"),
      thread("old", "guide please", "2026-01-01T00:00:00Z"),
    ];
    await pollYouTubeChannel(await currentRow());

    await vi.waitFor(() => expect(world.replies).toHaveLength(1), { timeout: 5000 });
    expect(world.replies[0]).toEqual({ parentId: "thread-new", textOriginal: "Link's in the description, Bea" });
    await vi.waitFor(() => expect(world.held).toEqual(["comment-spam"]), { timeout: 5000 });
    const [sam] = await db.select().from(contacts).where(eq(contacts.telegramUserId, "UC-sam"));
    await vi.waitFor(async () => {
      const held = await db.select().from(messages).where(eq(messages.contactId, sam!.id));
      expect(held.map((message) => message.body)).toContain("[public reply] Held for review automatically (“scam”)");
    });

    const [bea] = await db.select().from(contacts).where(eq(contacts.telegramUserId, "UC-bea"));
    expect(bea).toMatchObject({ firstName: "Bea", threadId: "thread-new" });
    const log = await db.select().from(messages).where(eq(messages.contactId, bea!.id));
    expect(log.map((message) => message.body)).toEqual(expect.arrayContaining(["[comment] where is the guide?", "[public reply] Link's in the description, Bea"]));
    expect(log.map((message) => message.body)).not.toContain("This never posts");

    // Polling again answers nothing twice.
    await pollYouTubeChannel(await currentRow());
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(world.replies).toHaveLength(1);
  });

  it("posts a Live Chat reply under the person's comment, and refuses anything automatic", async () => {
    const { sendAgentReply } = await import("@/lib/agent-reply");
    const { accountFromRow, channelTarget, sendChannelReply } = await import("@/lib/channels");
    const { getDb } = await import("@/lib/db");
    const { contacts } = await import("@/lib/db/schema");
    const [bea] = await (await getDb()).select().from(contacts).where(eq(contacts.telegramUserId, "UC-bea"));
    await sendAgentReply({ contactId: bea!.id, text: "Thanks for watching!", agent: null });
    expect(world.replies.at(-1)).toEqual({ parentId: "thread-new", textOriginal: "Thanks for watching!" });

    const account = accountFromRow(await currentRow());
    await expect(sendChannelReply(account, channelTarget({ telegramUserId: "UC-bea", threadId: "thread-new" }), { text: "Big sale", source: "broadcast" })).rejects.toThrow(/no private messages/);
  });

  it("deleting the channel drops the Google sign-in and revokes it", async () => {
    const { DELETE } = await import("@/app/api/bots/[id]/route");
    const { listConnections } = await import("@/lib/oauth/connections");
    expect(await listConnections("owner-1")).toHaveLength(1);
    const response = await DELETE(new Request("https://recatch.test", { method: "DELETE", body: JSON.stringify({ confirm: true }) }), { params: Promise.resolve({ id: botId }) });
    expect(response.status, await response.clone().text()).toBeLessThan(300);
    expect(await listConnections("owner-1")).toHaveLength(0);
    expect(hits.some((hit) => hit.url.pathname === "/revoke" && new URLSearchParams(hit.body).get("token") === "G-RT")).toBe(true);
  });
});
