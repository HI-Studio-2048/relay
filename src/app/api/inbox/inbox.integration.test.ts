import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The route reads the signed-in user from a request header that proxy.ts sets; stand in for it here.
let signedIn = "owner-1";
vi.mock("@/lib/auth", async () => {
  const { getDb } = await import("@/lib/db");
  const { bots } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  class AccessError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    AccessError,
    requireUserId: async () => signedIn,
    requireBotAccess: async (botId: string) => {
      const db = await getDb();
      const [row] = await db.select({ ownerId: bots.ownerId }).from(bots).where(eq(bots.id, botId)).limit(1);
      if (row?.ownerId !== signedIn) throw new AccessError("Not found", 404);
      return signedIn;
    },
  };
});

type Thread = { contactId: string; botId: string; lastBody: string };

async function inbox(botId: string) {
  const { GET } = await import("./route");
  const response = await GET(new Request(`http://test/api/inbox?botId=${botId}`));
  return { status: response.status, data: (await response.json()) as { threads?: Thread[] } };
}

describe("Inbox across accounts", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-inbox-")));
    const { getDb } = await import("@/lib/db");
    const { bots, contacts, messages, users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
    const bot = (id: string, ownerId: string) => ({ id, ownerId, name: id, tokenEncrypted: "x", webhookSecret: "x" });
    await db.insert(bots).values([bot("insta", "owner-1"), bot("telegram", "owner-1"), bot("theirs", "owner-2")]);
    const people = [
      { id: "c-insta", botId: "insta", at: "2026-10-14T10:00:00Z" },
      { id: "c-telegram", botId: "telegram", at: "2026-10-14T12:00:00Z" },
      { id: "c-theirs", botId: "theirs", at: "2026-10-14T13:00:00Z" },
    ];
    await db.insert(contacts).values(people.map((p) => ({ id: p.id, botId: p.botId, telegramUserId: p.id, firstName: p.id })));
    await db.insert(messages).values(
      people.map((p) => ({
        id: `m-${p.id}`,
        botId: p.botId,
        contactId: p.id,
        direction: "inbound",
        source: "user",
        body: `hello from ${p.id}`,
        createdAt: new Date(p.at),
      })),
    );
  });

  it("shows every account's conversations together, newest first, each labelled with its account", async () => {
    const { status, data } = await inbox("all");
    expect(status).toBe(200);
    expect(data.threads!.map((t) => [t.contactId, t.botId])).toEqual([
      ["c-telegram", "telegram"],
      ["c-insta", "insta"],
    ]);
  });

  it("can narrow to one account", async () => {
    const { data } = await inbox("insta");
    expect(data.threads!.map((t) => t.contactId)).toEqual(["c-insta"]);
  });

  it("never shows another customer's conversations", async () => {
    expect((await inbox("theirs")).status).toBe(404);
    signedIn = "owner-2";
    const { data } = await inbox("all");
    expect(data.threads!.map((t) => t.contactId)).toEqual(["c-theirs"]);
    signedIn = "owner-1";
  });
});
