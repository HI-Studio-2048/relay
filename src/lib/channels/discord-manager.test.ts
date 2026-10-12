import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Gateways would dial discord.com; this records which tokens the manager tried to open.
const opened: string[] = [];
const stopped: string[] = [];
vi.mock("@/lib/channels/discord-gateway", () => ({
  DiscordGateway: class {
    constructor(private readonly options: { token: string }) {
      opened.push(options.token);
    }
    async start() {}
    stop() {
      stopped.push(this.options.token);
    }
  },
}));

const SHARED = "SHARED-BOT-TOKEN";

describe("per-account Discord connections next to the shared bot", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-discord-manager-")));
    vi.stubEnv("DISCORD_CLIENT_ID", "app-1");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "secret");
    vi.stubEnv("DISCORD_BOT_TOKEN", SHARED);
    const { getDb } = await import("@/lib/db");
    const { bots, users } = await import("@/lib/db/schema");
    const { encryptSecret } = await import("@/lib/crypto");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" });
    const base = { ownerId: "owner-1", name: "x", channel: "discord", webhookSecret: "w", status: "connected", settings: {} };
    await db.insert(bots).values([
      { ...base, id: "own-bot", name: "Own bot (Discord)", tokenEncrypted: encryptSecret("A-OWN-TOKEN") },
      { ...base, id: "dupe-bot", name: "Relay (Discord)", tokenEncrypted: encryptSecret(SHARED) },
      { ...base, id: "shared-install", name: "Server (Discord)", tokenEncrypted: encryptSecret("placeholder"), settings: { discordShared: true, discordGuildId: "G1" } },
    ]);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("opens a connection for a bot of someone's own, and none for the shared installs or the shared bot's token", async () => {
    const { syncDiscordGateways } = await import("@/lib/channels/discord-manager");
    await syncDiscordGateways();
    expect(opened).toEqual(["A-OWN-TOKEN"]);
  });

  it("pauses the account that is really the shared bot, and says why", async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const { SHARED_BOT_DUPLICATE_ERROR } = await import("@/lib/channels/discord-install");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, "dupe-bot"));
    expect(row).toMatchObject({ status: "error", lastHealthError: SHARED_BOT_DUPLICATE_ERROR });
    const [healthy] = await (await getDb()).select().from(bots).where(eq(bots.id, "own-bot"));
    expect(healthy).toMatchObject({ status: "connected", lastHealthError: null });
  });

  it("does not open it again on the next minute's sync", async () => {
    const { syncDiscordGateways } = await import("@/lib/channels/discord-manager");
    await syncDiscordGateways();
    expect(opened).toEqual(["A-OWN-TOKEN"]);
    expect(stopped).toEqual([]);
  });
});
