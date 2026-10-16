import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The routes read the signed-in user from proxy.ts; stand in for it here.
let signedIn = "owner-1";
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), requireUserId: async () => signedIn, requireBotAccess: async () => signedIn }));

const queued: { botId: string; update: unknown }[] = [];
vi.mock("@/lib/queue", () => ({
  enqueueWebhook: async (job: { botId: string; update: unknown }) => void queued.push(job),
  shouldRunWorker: () => false,
}));
vi.mock("@/lib/worker", () => ({ drainJobs: async () => 0 }));

const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;

type Profile = { _id: string; name: string; externalId: string };
type Account = { _id: string; platform: string; username: string; profileId: string; isActive: boolean };
let profiles: Profile[] = [];
let accounts: Account[] = [];
const calls: string[] = [];
const sentBodies: Record<string, unknown>[] = [];
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
/** Comments on the giveaway post, as Zernio lists them. */
const postNine = [
  { id: "c-a", message: "Enter!", createdTime: ago(30), from: { id: "u-a", username: "anna" }, replies: [{ id: "c-r", message: "enter too", createdTime: ago(20), from: { id: "u-r", username: "rob" } }] },
  { id: "c-b", message: "nice watch", createdTime: ago(29), from: { id: "u-b", username: "ben" } },
  { id: "c-own", message: "enter here", createdTime: ago(28), from: { id: "brand", username: "danielphilipwatch", isOwner: true } },
  { id: "c-a2", message: "enter again", createdTime: ago(10), from: { id: "u-a", username: "anna" } },
  { id: "c-old", message: "enter", createdTime: ago(24 * 8), from: { id: "u-old", username: "late" } },
  { id: "c-done", message: "ENTER", createdTime: ago(5), from: { id: "u-done", username: "done" } },
];
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

/** A stand-in for Zernio's API that keeps profiles and accounts, like the real one. */
function fakeZernio() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    // Instagram's CDN, where the pictures people send live for a while.
    if (url.hostname === "cdn.instagram.test") return new Response(PNG, { headers: { "content-type": "image/png" } });
    if (url.hostname !== "zernio.com") return realFetch(input, init);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${url.search}`);
    if ((init?.headers as Record<string, string>)?.authorization !== "Bearer sk_company") return respond({ error: "bad key" }, 401);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === "/api/v1/profiles" && method === "GET") {
      const wanted = url.searchParams.get("externalId");
      return respond({ profiles: profiles.filter((profile) => !wanted || profile.externalId === wanted) });
    }
    if (url.pathname === "/api/v1/profiles" && method === "POST") {
      const profile = { _id: `p-${profiles.length + 1}`, name: body.name, externalId: body.externalId };
      profiles.push(profile);
      return respond({ profile }, 201);
    }
    if (url.pathname === "/api/v1/accounts" && method === "GET") {
      const wanted = url.searchParams.get("profileId");
      // The real API fills in the profile as an object, not the bare id; matching on the id alone dropped every account.
      const populated = accounts
        .filter((account) => !wanted || account.profileId === wanted)
        .map((account) => ({ ...account, profileId: { _id: account.profileId, name: "Recatch", externalId: profiles.find((profile) => profile._id === account.profileId)?.externalId ?? null } }));
      return respond({ accounts: populated });
    }
    if (url.pathname.startsWith("/api/v1/accounts/") && method === "DELETE") {
      const id = url.pathname.split("/").pop();
      accounts = accounts.filter((account) => account._id !== id);
      return respond({ ok: true });
    }
    // Reading a post's comments for the missed-comments catch-up.
    if (url.pathname === "/api/v1/inbox/comments" && method === "GET") {
      return respond({ data: [{ id: "post-9", content: "Giveaway! Comment enter", permalink: "https://www.instagram.com/p/x/", createdTime: new Date().toISOString() }] });
    }
    if (url.pathname === "/api/v1/inbox/comments/post-9" && method === "GET") {
      const page = url.searchParams.get("cursor") === "page-2" ? 2 : 1;
      return respond(page === 1 ? { comments: postNine.slice(0, 3), pagination: { hasMore: true, cursor: "page-2" } } : { comments: postNine.slice(3), pagination: { hasMore: false } });
    }
    // Comment replies. A comment id with "gone" in it stands for one Instagram won't answer (deleted, restricted).
    if (url.pathname.startsWith("/api/v1/inbox/comments/") && method === "POST") {
      if (url.pathname.includes("gone")) return respond({ error: "The commenter's account was not found." }, 400);
      sentBodies.push({ path: url.pathname, ...body });
      return respond({ data: { messageId: `c-${sentBodies.length}` } });
    }
    if (url.pathname.startsWith("/api/v1/inbox/conversations/") && method === "POST") {
      sentBodies.push(body);
      return respond({ data: { messageId: `out-${sentBodies.length}` } });
    }
    if (url.pathname.startsWith("/api/v1/connect/") && method === "GET") {
      return respond({ authUrl: `https://www.instagram.com/oauth/authorize?profile=${url.searchParams.get("profileId")}` });
    }
    return respond({ error: "unexpected" }, 404);
  });
}

const sign = (raw: string, secret = "whsec") => createHmac("sha256", secret).update(raw, "utf8").digest("hex");
const post = (handler: (request: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("Meta accounts through the company Zernio key", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-zernio-")));
    vi.stubEnv("ZERNIO_API_KEY", "sk_company");
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeZernio());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(() => {
    signedIn = "owner-1";
    queued.length = 0;
    calls.length = 0;
  });

  it("starts the connect in the signed-in user's own profile, made once", async () => {
    const { POST } = await import("@/app/api/zernio/connect/route");
    const first = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram" });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { authUrl: string }).authUrl).toContain("profile=p-1");
    await post(POST, "https://recatch.test/api/zernio/connect", { platform: "facebook" });
    expect(profiles).toEqual([{ _id: "p-1", name: expect.any(String), externalId: "owner-1" }]);
    signedIn = "owner-2";
    const other = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram" });
    expect(((await other.json()) as { authUrl: string }).authUrl).toContain("profile=p-2");
    expect(calls.some((call) => call.includes("/connect/instagram?") && call.includes("redirect_url=https%3A%2F%2Frecatch.test%2Fapi%2Fzernio%2Fcallback"))).toBe(true);
  });

  it("only offers Meta networks", async () => {
    const { POST } = await import("@/app/api/zernio/connect/route");
    expect((await post(POST, "https://recatch.test/api/zernio/connect", { platform: "tiktok" })).status).toBe(400);
  });

  it("makes the Meta account on the callback and shows only that user's accounts", async () => {
    accounts = [
      { _id: "a-1", platform: "instagram", username: "mine", profileId: "p-1", isActive: true },
      { _id: "a-2", platform: "instagram", username: "someone_else", profileId: "p-2", isActive: true },
    ];
    const { GET } = await import("@/app/api/zernio/callback/route");
    const response = await GET(new Request("https://recatch.test/api/zernio/callback?connected=instagram&accountId=a-1&username=mine"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    expect(row?.status).toBe("connected");
    expect((row?.settings?.zernioAccounts as { id: string }[]).map((account) => account.id)).toEqual(["a-1"]);
    expect(row?.webhookUrl).toBe("https://recatch.test/api/zernio/webhook");
    const { accountFromRow } = await import("@/lib/channels");
    expect(accountFromRow(row!).token).toBe("sk_company");
  });

  it("refuses to disconnect or reconnect an account in another user's profile", async () => {
    const { DELETE } = await import("@/app/api/zernio/accounts/[accountId]/route");
    const refused = await DELETE(
      new Request("https://recatch.test/api/zernio/accounts/a-2", { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
      { params: Promise.resolve({ accountId: "a-2" }) },
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(accounts.some((account) => account._id === "a-2")).toBe(true);
    const { POST } = await import("@/app/api/zernio/connect/route");
    const reconnect = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram", reconnectAccountId: "a-2" });
    expect(reconnect.status).toBe(400);
  });

  it("disconnects the user's own account", async () => {
    const { DELETE } = await import("@/app/api/zernio/accounts/[accountId]/route");
    const done = await DELETE(
      new Request("https://recatch.test/api/zernio/accounts/a-1", { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
      { params: Promise.resolve({ accountId: "a-1" }) },
    );
    expect(done.status).toBe(200);
    expect(accounts.map((account) => account._id)).toEqual(["a-2"]);
  });

  it("routes webhook events to the profile's owner and drops everything unsigned", async () => {
    accounts.push({ _id: "a-3", platform: "instagram", username: "mine", profileId: "p-1", isActive: true });
    const { syncZernioBot } = await import("@/lib/bots");
    await syncZernioBot("owner-1");
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    const { POST } = await import("@/app/api/zernio/webhook/route");

    const event = { event: "message.received", profiles: [{ id: "p-1", externalId: "owner-1" }], account: { accountId: "a-3", platform: "instagram" }, message: { id: "m1", text: "hi", sender: { id: "u1" } } };
    const raw = JSON.stringify(event);
    const send = (body: string, signature: string | null) =>
      POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", headers: signature ? { "x-zernio-signature": signature } : {}, body }));

    expect((await send(raw, null)).status).toBe(401);
    expect((await send(raw, sign(raw, "wrong"))).status).toBe(401);
    expect(queued).toHaveLength(0);

    expect((await send(raw, sign(raw))).status).toBe(200);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.botId).toBe(row!.id);

    const stray = JSON.stringify({ event: "message.received", account: { accountId: "a-9" }, message: { sender: { id: "u2" } } });
    expect((await send(stray, sign(stray))).status).toBe(200);
    const unknown = JSON.stringify({ ...event, profiles: [{ id: "p-9", externalId: "nobody" }] });
    expect((await send(unknown, sign(unknown))).status).toBe(200);
    expect(queued).toHaveLength(1);
  });

  it("saves an account Zernio connected even when the callback carries none of the expected parameters", async () => {
    // What happened live: Zernio linked an Instagram account but the callback lacked connected/accountId.
    signedIn = "owner-2";
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    const owner2 = () => db.select().from(bots).where(and(eq(bots.ownerId, "owner-2"), eq(bots.channel, "zernio")));
    expect(await owner2()).toHaveLength(0);

    const { GET } = await import("@/app/api/zernio/callback/route");
    const response = await GET(new Request("https://recatch.test/api/zernio/callback?status=success"));
    expect(response.headers.get("location")).toContain("connected=");
    const [row] = await owner2();
    expect((row?.settings?.zernioAccounts as { id: string }[]).map((account) => account.id)).toEqual(["a-2"]);
  });

  it("finds the owner of an account event from the account's profile when the event has no profiles list", async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.delete(bots).where(eq(bots.ownerId, "owner-2"));
    const { POST } = await import("@/app/api/zernio/webhook/route");
    const send = (body: unknown) => {
      const raw = JSON.stringify(body);
      return POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", headers: { "x-zernio-signature": sign(raw) }, body: raw }));
    };

    expect((await send({ event: "account.connected", account: { _id: "a-2", platform: "instagram", profileId: "p-2" } })).status).toBe(200);
    expect(await db.select().from(bots).where(eq(bots.ownerId, "owner-2"))).toHaveLength(1);

    await db.delete(bots).where(eq(bots.ownerId, "owner-2"));
    expect((await send({ event: "account.connected", account: { _id: "a-2", profileId: { _id: "p-2", externalId: "owner-2" } } })).status).toBe(200);
    expect(await db.select().from(bots).where(eq(bots.ownerId, "owner-2"))).toHaveLength(1);
  });

  it("answers 503 when the webhook secret is not set", async () => {
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/zernio/webhook/route");
    const response = await POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "whsec");
  });

  it("keeps a copy of an image someone sends, and a teammate can send one back", async () => {
    signedIn = "owner-1";
    const { getDb } = await import("@/lib/db");
    const { bots, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    const { processChannelUpdate } = await import("@/lib/webhook");
    await processChannelUpdate(row!.id, {
      event: "message.received",
      profiles: [{ id: "p-1", externalId: "owner-1" }],
      account: { accountId: "a-3", platform: "instagram" },
      message: {
        id: "m-img",
        conversationId: "conv-1",
        sender: { id: "u-pic", name: "Pic Sender" },
        attachments: [{ type: "image", url: "https://cdn.instagram.test/v/123_n.jpg?stp=1" }],
      },
    });

    const { readMediaFile, parseStoredMediaUrl } = await import("@/lib/media");
    const [inbound] = await db.select().from(messages).where(and(eq(messages.botId, row!.id), eq(messages.direction, "inbound")));
    expect(inbound!.body).toBe("[image]");
    const kept = parseStoredMediaUrl(inbound!.media![0]!.url);
    expect(kept?.type).toBe("local");
    const stored = await readMediaFile((kept as { id: string }).id);
    expect(stored.record.kind).toBe("photo");
    expect([...stored.bytes]).toEqual([...PNG]);

    const upload = new FormData();
    upload.append("file", new File([PNG], "reply.png", { type: "image/png" }));
    const media = await import("@/app/api/media/route");
    const uploaded = (await (await media.POST(new Request("https://recatch.test/api/media", { method: "POST", body: upload }))).json()) as { media: { url: string } };

    const { POST: reply } = await import("@/app/api/inbox/[contactId]/reply/route");
    const params = { params: Promise.resolve({ contactId: inbound!.contactId }) };
    const sent = await reply(new Request("https://recatch.test/api/inbox/x/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "", media: { url: uploaded.media.url, kind: "document" } }) }), params);
    expect(sent.status).toBe(200);
    expect(sentBodies.at(-1)).toMatchObject({ accountId: "a-3", attachmentUrl: `https://recatch.test${uploaded.media.url}`, attachmentType: "image" });
    const outbound = await db.select().from(messages).where(and(eq(messages.contactId, inbound!.contactId), eq(messages.direction, "outbound")));
    expect(outbound.at(-1)).toMatchObject({ body: "[image]", media: [expect.objectContaining({ url: uploaded.media.url, kind: "photo" })] });

    // Only Recatch's own uploads go out from Live Chat.
    const foreign = await reply(new Request("https://recatch.test/api/inbox/x/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ media: { url: "https://evil.test/a.png" } }) }), params);
    expect(foreign.status).toBe(400);
  });

  it("keeps a waiting comment flow when a later comment's DM fails, so the button still works", async () => {
    signedIn = "owner-1";
    const { getDb } = await import("@/lib/db");
    const { bots, flows } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    await db.insert(flows).values({
      id: "giveaway",
      botId: row!.id,
      name: "Giveaway",
      triggerType: "comment",
      triggerValue: "enter",
      isActive: true,
      definition: {
        startStepId: "open",
        trigger: { publicReplies: ["You're in!"], oncePerContact: true },
        steps: [
          { id: "open", type: "text", text: "You're entered", buttons: [{ text: "Count me in", next: "ask" }] },
          { id: "ask", type: "capture", field: "email", prompt: "What's your email?", skippable: true, next: "done" },
          { id: "done", type: "end", text: "All set" },
        ],
      },
    });
    const { processChannelUpdate } = await import("@/lib/webhook");
    const comment = (id: string, postId: string) =>
      processChannelUpdate(row!.id, {
        event: "comment.received",
        profiles: [{ id: "p-1", externalId: "owner-1" }],
        account: { accountId: "a-3", platform: "instagram" },
        comment: { id, text: "Enter", postId, platformPostId: postId, platform: "instagram", author: { id: "u-give", username: "giver" } },
      });

    await comment("c-1", "post-1");
    expect(sentBodies.at(-1)).toMatchObject({ path: "/api/v1/inbox/comments/post-1/c-1/private-reply" });
    // A second comment elsewhere whose DM Instagram refuses.
    await comment("c-gone", "post-2");

    await processChannelUpdate(row!.id, {
      event: "message.received",
      profiles: [{ id: "p-1", externalId: "owner-1" }],
      account: { accountId: "a-3", platform: "instagram" },
      metadata: { postbackPayload: "n:ask" },
      message: { id: "m-tap", conversationId: "conv-give", text: "Count me in", sender: { id: "u-give" } },
    });
    expect(sentBodies.at(-1)).toMatchObject({ accountId: "a-3", message: "What's your email?" });
  });

  it("finds the comments a flow missed and DMs them in batches, without public replies", async () => {
    signedIn = "owner-1";
    const { getDb } = await import("@/lib/db");
    const { bots, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    // u-done's comment was answered live.
    const { processChannelUpdate } = await import("@/lib/webhook");
    await processChannelUpdate(row!.id, {
      event: "comment.received",
      profiles: [{ id: "p-1", externalId: "owner-1" }],
      account: { accountId: "a-3", platform: "instagram" },
      comment: { id: "c-done", text: "ENTER", postId: "post-9", platformPostId: "post-9", platform: "instagram", author: { id: "u-done", username: "done" } },
    });

    const route = await import("@/app/api/flows/[id]/missed-comments/route");
    const params = { params: Promise.resolve({ id: "giveaway" }) };
    const posts = (await (await route.GET(new Request("https://recatch.test/api/flows/giveaway/missed-comments"), params)).json()) as { posts: { id: string; accountId: string }[] };
    expect(posts.posts.map((post) => [post.id, post.accountId])).toEqual([["post-9", "a-3"]]);

    const preview = async () =>
      ((await (await route.GET(new Request("https://recatch.test/api/flows/giveaway/missed-comments?accountId=a-3&postId=post-9"), params)).json()) as {
        missed: { commentId: string; username: string }[];
      }).missed;
    // Anna once (her first comment), Rob's reply; not Ben (no keyword), the brand, an 8-day-old comment, or Done.
    expect((await preview()).map((item) => [item.username, item.commentId])).toEqual([
      ["anna", "c-a"],
      ["rob", "c-r"],
    ]);
    const before = sentBodies.length;
    expect(sentBodies.slice(0, before).some((body) => String(body.path).includes("c-a"))).toBe(false);

    const send = async () =>
      (await (
        await route.POST(new Request("https://recatch.test/api/flows/giveaway/missed-comments", { method: "POST", body: JSON.stringify({ accountId: "a-3", postId: "post-9", limit: 1 }) }), params)
      ).json()) as { sent: number; failed: number; remaining: number };
    expect(await send()).toEqual({ sent: 1, failed: 0, remaining: 1 });
    expect(await send()).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(await preview()).toEqual([]);

    const paths = sentBodies.slice(before).map((body) => body.path);
    expect(paths).toEqual(["/api/v1/inbox/comments/post-9/c-a/private-reply", "/api/v1/inbox/comments/post-9/c-r/private-reply"]);
    const logged = await db.select().from(messages).where(and(eq(messages.botId, row!.id), eq(messages.telegramMessageId, "c-a")));
    expect(logged.map((message) => message.body)).toEqual(["[comment] Enter!"]);
  });
});
