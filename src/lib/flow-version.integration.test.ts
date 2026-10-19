import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), requireUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/resources")>()),
  requireRowAccess: async () => undefined,
}));
vi.mock("@/lib/bot-commands", () => ({ syncBotCommands: async () => undefined }));
vi.mock("@/lib/activity", () => ({ logActivity: async () => undefined }));

const definition = (text: string) => ({ startStepId: "s1", steps: [{ id: "s1", type: "message", text }] });

function patch(body: unknown) {
  return new Request("http://local.test/api/flows/flow-1", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("flow editor stale-save check", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-stale-flow-")));
    const { getDb } = await import("@/lib/db");
    const { bots, flows, users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" });
    await db.insert(bots).values({ id: "bot-1", ownerId: "owner-1", channel: "telegram", name: "Bot", tokenEncrypted: "x", webhookSecret: "s" } as typeof bots.$inferInsert);
    // Insert with defaultNow(), so updated_at carries microseconds that a JS Date can't hold.
    await db.insert(flows).values({ id: "flow-1", botId: "bot-1", name: "Giveaway", triggerType: "keyword", triggerValue: "win", definition: definition("v1") });
  });

  async function stored() {
    const { getDb } = await import("@/lib/db");
    const { flows, flowVersions } = await import("@/lib/db/schema");
    const db = await getDb();
    const [flow] = await db.select().from(flows).where(eq(flows.id, "flow-1"));
    const versions = await db.select().from(flowVersions).where(eq(flowVersions.flowId, "flow-1"));
    return { flow, versions: versions.length };
  }

  it("saves with the current version, returns the new one, and refuses the old one afterwards", async () => {
    const { PATCH } = await import("@/app/api/flows/[id]/route");
    const { flowVersionOf } = await import("@/lib/flow-version");
    const loaded = flowVersionOf((await stored()).flow.updatedAt);

    const first = await PATCH(patch({ triggerValue: "win, prize", definition: definition("v2"), baseUpdatedAt: loaded }), params("flow-1"));
    expect(first.status).toBe(200);
    const saved = (await first.json()) as { flow: { updatedAt: string } };
    expect(saved.flow.updatedAt).not.toBe(loaded);
    expect((await stored()).versions).toBe(1);

    // The same tab saves again on the version it adopted: fine.
    const again = await PATCH(patch({ definition: definition("v3"), baseUpdatedAt: saved.flow.updatedAt }), params("flow-1"));
    expect(again.status).toBe(200);
    const before = await stored();
    expect(before.versions).toBe(2);

    // An older tab still on the first version is refused and writes nothing, not even a history entry.
    const stale = await PATCH(patch({ triggerValue: "win", definition: definition("old tab"), isActive: false, baseUpdatedAt: loaded }), params("flow-1"));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe("stale_flow");
    const after = await stored();
    expect(after.flow.triggerValue).toBe("win, prize");
    expect(after.flow.definition).toEqual(definition("v3"));
    expect(after.flow.isActive).toBe(true);
    expect(after.flow.updatedAt.getTime()).toBe(before.flow.updatedAt.getTime());
    expect(after.versions).toBe(2);
  });

  it("still saves when no version is sent (API, agent, imports)", async () => {
    const { PATCH } = await import("@/app/api/flows/[id]/route");
    const res = await PATCH(patch({ definition: definition("from the API") }), params("flow-1"));
    expect(res.status).toBe(200);
    expect((await stored()).flow.definition).toEqual(definition("from the API"));
  });

  it("refuses a History restore from a stale tab", async () => {
    const { POST } = await import("@/app/api/flows/[id]/versions/[versionId]/route");
    const { getDb } = await import("@/lib/db");
    const { flowVersions } = await import("@/lib/db/schema");
    const [version] = await (await getDb()).select().from(flowVersions).where(eq(flowVersions.flowId, "flow-1")).limit(1);
    const before = await stored();
    const request = (body: unknown) => new Request("http://local.test/x", { method: "POST", body: JSON.stringify(body) });
    const ctx = { params: Promise.resolve({ id: "flow-1", versionId: version.id }) };

    const stale = await POST(request({ baseUpdatedAt: "2020-01-01T00:00:00.000Z" }), ctx);
    expect(stale.status).toBe(409);
    expect((await stored()).versions).toBe(before.versions);

    const ok = await POST(request({ baseUpdatedAt: before.flow.updatedAt.toISOString() }), ctx);
    expect(ok.status).toBe(200);
    expect((await stored()).flow.definition).toEqual(version.definition);
  });
});
