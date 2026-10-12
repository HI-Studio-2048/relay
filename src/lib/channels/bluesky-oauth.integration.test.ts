import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn = "owner-1";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn, requireBotAccess: async () => undefined }));

/**
 * Stand-ins for Bluesky's side. The real OAuth protocol belongs to Bluesky's library (tested by its
 * authors); what is tested here is everything Recatch does around it.
 */
type Hit = { pathname: string; method: string; body: Record<string, unknown>; proxy: string | null };
const hits: Hit[] = [];
const world = {
  logs: [] as { rev: string; entry: Record<string, unknown> }[],
  dmAllowed: true,
  sessionBroken: false,
  callbackFails: false,
  callbackDid: "did:plc:ada",
};
const clientCalls = { authorize: [] as { input: string; options: { state?: string; scope?: string } }[], revoked: [] as string[] };

const session = {
  did: "did:plc:ada",
  async fetchHandler(pathname: string, init: RequestInit = {}) {
    const url = new URL(pathname, "https://pds.example.test");
    const headers = new Headers(init.headers);
    const nsid = url.pathname.replace("/xrpc/", "");
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    hits.push({ pathname: url.pathname + url.search, method: init.method ?? "GET", body, proxy: headers.get("atproto-proxy") });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (!world.dmAllowed) return reply({ error: "InvalidToken", message: "Bad token scope" }, 400);
    if (nsid === "chat.bsky.convo.listConvos") return reply({ convos: [] });
    if (nsid === "chat.bsky.convo.getLog") {
      const cursor = url.searchParams.get("cursor");
      const logs = world.logs.filter((log) => !cursor || log.rev > cursor);
      return reply({ cursor: logs.at(-1)?.rev ?? cursor ?? undefined, logs: logs.map((log) => log.entry) });
    }
    if (nsid === "chat.bsky.convo.acceptConvo") return reply({});
    if (nsid === "chat.bsky.convo.getConvoForMembers") return reply({ convo: { id: "convo-1" } });
    if (nsid === "chat.bsky.convo.sendMessage") return reply({ id: `sent-${hits.length}` });
    return reply({ error: "MethodNotImplemented" }, 501);
  },
};

vi.mock("@atproto/oauth-client-node", () => ({
  NodeOAuthClient: class {
    jwks = { keys: [] };
    async authorize(input: string, options: { state?: string; scope?: string }) {
      clientCalls.authorize.push({ input, options });
      return new URL(`https://bsky.social/oauth/authorize?request_uri=urn%3Afake&state=${encodeURIComponent(options.state ?? "")}`);
    }
    async callback(params: URLSearchParams) {
      if (world.callbackFails) throw new Error("state does not match");
      return { session: { ...session, did: world.callbackDid }, state: params.get("state") };
    }
    async restore() {
      if (world.sessionBroken) throw new Error("token revoked");
      return session;
    }
    async revoke(did: string) {
      clientCalls.revoked.push(did);
    }
  },
}));

const realFetch = globalThis.fetch;
function fakePublicApi() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "public.api.bsky.app") return realFetch(input, init);
    return new Response(JSON.stringify({ handle: "ada.bsky.social", displayName: "Ada Lovelace" }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

const incoming = (rev: string, id: string, text: string, did = "did:plc:friend") => ({
  rev,
  entry: { $type: "chat.bsky.convo.defs#logCreateMessage", convoId: "convo-1", rev, message: { $type: "chat.bsky.convo.defs#messageView", id, text, sender: { did } } },
});

describe("Sign in with Bluesky through the whole app", () => {
  let botId = "";

  const row = async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    return (await (await getDb()).select().from(bots).where(eq(bots.id, botId)))[0]!;
  };
  const allBots = async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    return (await (await getDb()).select().from(bots)).filter((item) => item.channel === "bluesky");
  };

  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-bsky-oauth-int-")));
    const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
    vi.stubEnv("BLUESKY_OAUTH_KEY", JSON.stringify({ ...jwk, kid: "recatch-test", alg: "ES256" }));
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakePublicApi());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    await (await getDb()).insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const start = async (handle?: string) => {
    const { GET } = await import("@/app/api/bluesky/install/route");
    const response = await GET(new Request(`https://recatch.test/api/bluesky/install${handle ? `?handle=${encodeURIComponent(handle)}` : ""}`));
    return { status: response.status, location: new URL(response.headers.get("location")!, "https://recatch.test") };
  };
  const callback = async (state: string | null, extra = "") => {
    const { GET } = await import("@/app/api/bluesky/oauth/callback/route");
    const response = await GET(new Request(`https://recatch.test/api/bluesky/oauth/callback?code=c&iss=https%3A%2F%2Fbsky.social${state ? `&state=${encodeURIComponent(state)}` : ""}${extra}`));
    return new URL(response.headers.get("location")!, "https://recatch.test");
  };

  it("sends the person to Bluesky for the handle they typed, asking for DMs, with a signed state", async () => {
    const { location } = await start("@ada.bsky.social");
    expect(location.origin).toBe("https://bsky.social");
    expect(clientCalls.authorize.at(-1)).toMatchObject({ input: "ada.bsky.social", options: { scope: "atproto transition:generic transition:chat.bsky" } });
    expect(clientCalls.authorize.at(-1)!.options.state).toBeTruthy();
  });

  it("starts at bsky.social when no handle is typed", async () => {
    await start();
    expect(clientCalls.authorize.at(-1)!.input).toBe("https://bsky.social");
  });

  it("saves the account from the sign-in, with no password and a placeholder in the token column", async () => {
    await start("ada.bsky.social");
    const state = clientCalls.authorize.at(-1)!.options.state!;
    const done = await callback(state);
    expect(done.pathname).toBe("/setup");
    expect(done.searchParams.get("connected")).toMatch(/ada\.bsky\.social/);

    const [bot] = await allBots();
    botId = bot!.id;
    expect(bot).toMatchObject({ ownerId: "owner-1", name: "@ada.bsky.social (Bluesky)", externalAccountId: "did:plc:ada", status: "connected", webhookUrl: null });
    expect(bot!.settings).toMatchObject({ blueskyOauth: true });
    expect(bot!.tokenEncrypted).not.toContain("bluesky-oauth");
  });

  it("signing in again updates the same account instead of adding another", async () => {
    await start("ada.bsky.social");
    await callback(clientCalls.authorize.at(-1)!.options.state!);
    expect(await allBots()).toHaveLength(1);
  });

  it("rejects a sign-in that this user did not start, and signs it out at Bluesky", async () => {
    signedIn = "owner-2";
    await start("ada.bsky.social");
    const otherUsersState = clientCalls.authorize.at(-1)!.options.state!;
    signedIn = "owner-1";
    clientCalls.revoked.length = 0;
    const done = await callback(otherUsersState);
    expect(done.searchParams.get("error")).toMatch(/could not be verified/);
    expect(clientCalls.revoked).toEqual(["did:plc:ada"]);
  });

  it("refuses an account another Recatch user already connected", async () => {
    signedIn = "owner-2";
    await start("ada.bsky.social");
    const done = await callback(clientCalls.authorize.at(-1)!.options.state!);
    signedIn = "owner-1";
    expect(done.searchParams.get("error")).toMatch(/already connected/);
  });

  it("reports a cancelled or failed sign-in without saving anything new", async () => {
    const before = (await allBots()).length;
    const cancelled = await callback(null, "&error=access_denied");
    expect(cancelled.searchParams.get("error")).toMatch(/cancelled/);
    world.callbackFails = true;
    const failed = await callback("whatever");
    world.callbackFails = false;
    expect(failed.searchParams.get("error")).toMatch(/Could not connect Bluesky/);
    expect(await allBots()).toHaveLength(before);
  });

  it("refuses an account that did not grant direct messages, and signs it out", async () => {
    world.callbackDid = "did:plc:nodm";
    world.dmAllowed = false;
    await start("nodm.bsky.social");
    clientCalls.revoked.length = 0;
    const done = await callback(clientCalls.authorize.at(-1)!.options.state!);
    world.dmAllowed = true;
    world.callbackDid = "did:plc:ada";
    expect(done.searchParams.get("error")).toMatch(/direct messages permission/);
    expect(clientCalls.revoked).toContain("did:plc:nodm");
    expect((await allBots()).some((bot) => bot.externalAccountId === "did:plc:nodm")).toBe(false);
  });

  it("does not answer old conversations on the first look, then answers a new DM through the session", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    world.logs = [incoming("r1", "old", "an old message")];
    hits.length = 0;
    await pollBlueskyAccount(await row());
    expect(hits.find((hit) => hit.pathname.startsWith("/xrpc/chat.bsky.convo.getLog"))).toMatchObject({ proxy: "did:web:api.bsky.chat#bsky_chat" });
    expect((await row()).settings?.blueskyCursor).toBe("r1");
    expect(hits.some((hit) => hit.pathname.includes("sendMessage"))).toBe(false);

    world.logs.push(incoming("r2", "m2", "hello there"));
    hits.length = 0;
    await pollBlueskyAccount(await row());
    const { getDb } = await import("@/lib/db");
    const { contacts } = await import("@/lib/db/schema");
    const db = await getDb();
    await vi.waitFor(async () => expect(await db.select().from(contacts).where(eq(contacts.botId, botId))).toHaveLength(1), { timeout: 5000 });
    await vi.waitFor(() => expect(hits.some((hit) => hit.pathname.includes("sendMessage"))).toBe(true), { timeout: 5000 });
    const sent = hits.find((hit) => hit.pathname.includes("sendMessage"))!;
    expect(sent).toMatchObject({ method: "POST", proxy: "did:web:api.bsky.chat#bsky_chat", body: { convoId: "convo-1" } });
  });

  it("shows 'sign in again' on the account when Bluesky has revoked the session, then recovers", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    world.sessionBroken = true;
    await pollBlueskyAccount(await row());
    expect(await row()).toMatchObject({ status: "error" });
    expect((await row()).lastHealthError).toMatch(/Sign in with Bluesky/);
    world.sessionBroken = false;
    await pollBlueskyAccount(await row());
    expect(await row()).toMatchObject({ status: "connected", lastHealthError: null });
  });

  it("health check uses the session, and reports a revoked one", async () => {
    const { healthCheckBot } = await import("@/lib/bots");
    expect((await healthCheckBot(botId)).bot).toMatchObject({ status: "connected", name: "@ada.bsky.social (Bluesky)" });
    world.sessionBroken = true;
    const broken = await healthCheckBot(botId);
    world.sessionBroken = false;
    expect(broken.bot.status).toBe("error");
    expect(broken.bot.lastHealthError).toMatch(/expired or was revoked/);
  });

  it("signs out at Bluesky when the account is disconnected", async () => {
    const { DELETE } = await import("@/app/api/bots/[id]/route");
    clientCalls.revoked.length = 0;
    const response = await DELETE(new Request("https://recatch.test/api/bots/x", { method: "DELETE", body: JSON.stringify({ confirm: true }) }), { params: Promise.resolve({ id: botId }) });
    expect((await response.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(clientCalls.revoked).toEqual(["did:plc:ada"]);
    expect(await allBots()).toHaveLength(0);
  });
});

describe("Sign in with Bluesky when it is not set up", () => {
  it("sends the person back with a clear message instead of starting", async () => {
    vi.stubEnv("BLUESKY_OAUTH_KEY", "");
    const { GET } = await import("@/app/api/bluesky/install/route");
    const response = await GET(new Request("https://recatch.test/api/bluesky/install"));
    expect(new URL(response.headers.get("location")!, "https://recatch.test").searchParams.get("error")).toMatch(/not set up/);
  });
});
