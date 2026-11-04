import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Sends are faked: each test decides whether the channel accepts or refuses.
const sendChannelReply = vi.fn();
vi.mock("@/lib/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels")>()),
  sendChannelReply: (...args: unknown[]) => sendChannelReply(...args),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  acquireSendSlot: async () => undefined,
}));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("background sends recover instead of looping or sticking", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-worker-")));
    const { getDb } = await import("@/lib/db");
    const { bots, contacts, flows, users } = await import("@/lib/db/schema");
    const { encryptSecret } = await import("@/lib/crypto");
    const db = await getDb();
    const token = encryptSecret("123:fake");
    await db.insert(users).values({ id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x", billingStatus: "active" });
    await db.insert(bots).values([
      { id: "bot-tg", ownerId: "owner-1", channel: "telegram", name: "Bot", tokenEncrypted: token, webhookSecret: "s" },
      { id: "bot-yt", ownerId: "owner-1", channel: "youtube", name: "Channel", tokenEncrypted: token, webhookSecret: "s2", settings: { csat: { enabled: true } } },
    ] as (typeof bots.$inferInsert)[]);
    await db.insert(contacts).values([
      { id: "c-1", botId: "bot-tg", telegramUserId: "101" },
      { id: "c-2", botId: "bot-tg", telegramUserId: "102" },
      { id: "c-3", botId: "bot-tg", telegramUserId: "103" },
      { id: "c-yt", botId: "bot-yt", telegramUserId: "UCviewer" },
    ]);
    await db.insert(flows).values({
      id: "flow-1",
      botId: "bot-tg",
      name: "Reminder",
      triggerType: "keyword",
      triggerValue: "hi",
      definition: { startStepId: "s1", steps: [{ id: "s1", type: "delay", seconds: 60, next: "s2" }, { id: "s2", type: "message", text: "Still there?" }] },
    });
  });

  beforeEach(() => {
    sendChannelReply.mockReset();
  });

  it("backs off a failing sequence step and gives up after a few tries", async () => {
    const { getDb } = await import("@/lib/db");
    const { sequences, sequenceSteps, sequenceSubscriptions } = await import("@/lib/db/schema");
    const { resumeDueSequences, RETRY_DELAYS_MS } = await import("@/lib/sequence-resume");
    const db = await getDb();
    await db.insert(sequences).values({ id: "seq-1", botId: "bot-tg", name: "Drip" });
    await db.insert(sequenceSteps).values({ id: "step-1", sequenceId: "seq-1", position: 0, body: "Day one" });
    await db.insert(sequenceSubscriptions).values({ id: "sub-1", sequenceId: "seq-1", contactId: "c-1", nextIndex: 0, nextAt: minutesAgo(1) });
    sendChannelReply.mockRejectedValue(new Error("Forbidden: bot was blocked by the user"));
    const row = async () => (await db.select().from(sequenceSubscriptions).where(eq(sequenceSubscriptions.id, "sub-1")))[0]!;

    await resumeDueSequences();
    let sub = await row();
    expect(sub).toMatchObject({ nextIndex: 0, attempts: 1, status: "active" });
    expect(sub.nextAt.getTime()).toBeGreaterThan(Date.now() + RETRY_DELAYS_MS[0]! - 5_000);
    // Not due yet: the next tick leaves them alone.
    await resumeDueSequences();
    expect(sendChannelReply).toHaveBeenCalledTimes(1);

    for (let attempt = 2; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
      await db.update(sequenceSubscriptions).set({ nextAt: minutesAgo(1) }).where(eq(sequenceSubscriptions.id, "sub-1"));
      await resumeDueSequences();
    }
    sub = await row();
    expect(sub.status).toBe("failed");
    expect(sendChannelReply).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it("keeps a pending delay through a takeover pause and sends it once the pause runs out", async () => {
    const { getDb } = await import("@/lib/db");
    const { contacts, flowSessions } = await import("@/lib/db/schema");
    const { listDueDelaySessions, pauseContactAutomation } = await import("@/lib/store");
    const db = await getDb();
    await db.insert(flowSessions).values({ id: "sess-1", contactId: "c-2", flowId: "flow-1", stepId: "s1", status: "active", resumeAt: minutesAgo(-60) });

    await pauseContactAutomation("c-2", 30);
    const [paused] = await db.select().from(flowSessions).where(eq(flowSessions.contactId, "c-2"));
    expect(paused?.status).toBe("paused");
    expect(paused?.resumeAt).not.toBeNull();

    // The follow-up comes due while a teammate still has the conversation: held.
    await db.update(flowSessions).set({ resumeAt: minutesAgo(1) }).where(eq(flowSessions.contactId, "c-2"));
    expect((await listDueDelaySessions()).map((row) => row.contactId)).not.toContain("c-2");
    // The pause runs out: the worker picks it up.
    await db.update(contacts).set({ botPausedUntil: minutesAgo(1) }).where(eq(contacts.id, "c-2"));
    expect((await listDueDelaySessions()).map((row) => row.contactId)).toContain("c-2");
  });

  it("finishes a broadcast a restart cut off, without sending the interrupted row again", async () => {
    const { getDb } = await import("@/lib/db");
    const { broadcastRecipients, broadcasts } = await import("@/lib/db/schema");
    const { resumeStuckBroadcasts } = await import("@/lib/worker");
    const db = await getDb();
    await db.insert(broadcasts).values({ id: "bc-1", botId: "bot-tg", name: "Launch", body: "We're live", status: "sending", startedAt: minutesAgo(20), totalCount: 2 });
    await db.insert(broadcastRecipients).values([
      { id: "r-cut", broadcastId: "bc-1", contactId: "c-1", status: "sending", claimedAt: minutesAgo(20) },
      { id: "r-wait", broadcastId: "bc-1", contactId: "c-3", status: "pending" },
    ]);
    sendChannelReply.mockResolvedValue({ message_id: "m-1" });

    await resumeStuckBroadcasts(Date.now() + 120_000);
    const rows = await db.select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, "bc-1"));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({ "r-cut": "failed", "r-wait": "sent" });
    expect(sendChannelReply).toHaveBeenCalledTimes(1);
    const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, "bc-1"));
    expect(broadcast).toMatchObject({ status: "sent", sentCount: 1, failedCount: 1 });
  });

  it("never posts the rating question on YouTube, where it would be a public reply", async () => {
    const { saveMessage } = await import("@/lib/store");
    const { sendCsatSurvey } = await import("@/lib/csat-send");
    await saveMessage({ botId: "bot-yt", contactId: "c-yt", direction: "outbound", source: "agent", body: "Thanks for watching!" });
    expect(await sendCsatSurvey("c-yt")).toBe(false);
    expect(sendChannelReply).not.toHaveBeenCalled();
  });
});
