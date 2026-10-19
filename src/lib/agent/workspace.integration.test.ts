import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentComplete } from "@/lib/agent/run";

describe("workspace inbox and growth-agent tools", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-workspace-")));
    const { getDb } = await import("@/lib/db");
    const { users, bots, contacts, messages, tags } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
    await db.insert(bots).values([
      { id: "tg", ownerId: "owner-1", name: "Shop", channel: "telegram", tokenEncrypted: "x", webhookSecret: "s", status: "connected" },
      { id: "ig", ownerId: "owner-1", name: "Brand", channel: "instagram", tokenEncrypted: "x", webhookSecret: "s", status: "connected" },
      { id: "other", ownerId: "owner-2", name: "Secret", channel: "slack", tokenEncrypted: "x", webhookSecret: "s", status: "connected" },
    ]);
    await db.insert(contacts).values([
      { id: "c-ada", botId: "tg", telegramUserId: "ada", firstName: "Ada", email: "ada@example.test", platform: "telegram" },
      { id: "c-bea", botId: "ig", telegramUserId: "bea", firstName: "Bea", platform: "instagram" },
      { id: "c-cy", botId: "other", telegramUserId: "cy", firstName: "Cy", platform: "slack" },
    ]);
    await db.insert(messages).values([
      { id: "m1", botId: "tg", contactId: "c-ada", direction: "inbound", source: "user", body: "hello from telegram" },
      { id: "m2", botId: "ig", contactId: "c-bea", direction: "inbound", source: "user", body: "hello from instagram" },
      { id: "m3", botId: "other", contactId: "c-cy", direction: "inbound", source: "user", body: "not yours" },
    ]);
    await db.insert(tags).values({ id: "tag-lead", botId: "tg", name: "lead" });
  });

  afterAll(() => {
    // The temp directory is discarded with the worker.
  });

  it("lists every channel in the workspace and leaves other workspaces out", async () => {
    const { listInboxThreads, listWorkspaceInbox } = await import("@/lib/store");
    const all = await listWorkspaceInbox("owner-1");
    expect(all.map((thread) => thread.botName).sort()).toEqual(["Brand", "Shop"]);
    expect(all.map((thread) => thread.channel).sort()).toEqual(["instagram", "telegram"]);
    expect(all.some((thread) => thread.lastBody === "not yours")).toBe(false);
    const one = await listInboxThreads("tg");
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ botId: "tg", botName: "Shop", name: "Ada" });
  });

  it("saves a lead flow as a draft, refuses other workspaces, and will not edit a live flow", async () => {
    const { createDraftBroadcast, createDraftFlow, runAgentTool, updateDraftFlow } = await import("@/lib/agent/tools");
    const { getDb } = await import("@/lib/db");
    const { flows, broadcasts } = await import("@/lib/db/schema");
    const sketch = {
      botId: "tg",
      name: "Guide leads",
      triggerType: "keyword_contains",
      keywords: "guide",
      steps: [
        { id: "s1", type: "message", text: "Want the guide?", buttons: [{ label: "Yes", next: "s2" }], next: "" },
        { id: "s2", type: "question", text: "Name?", field: "name", next: "s3" },
        { id: "s3", type: "question", text: "Email?", field: "email", next: "s4" },
        { id: "s4", type: "question", text: "Phone?", field: "phone", next: "s5" },
        { id: "s5", type: "question", text: "Company?", field: "company", next: "s6" },
        { id: "s6", type: "tag", tag: "lead", next: "s7" },
        { id: "s7", type: "end", text: "Thanks" },
      ],
      isActive: true,
    };
    const created = await createDraftFlow("owner-1", sketch);
    expect(created.draft?.href).toMatch(/^\/flows\//);
    const db = await getDb();
    const [saved] = await db.select().from(flows).where(eq(flows.id, created.draft!.id));
    expect(saved?.isActive).toBe(false);
    const fields = (saved?.definition as { steps: { type: string; field?: string }[] }).steps
      .filter((step) => step.type === "capture")
      .map((step) => step.field);
    expect(fields).toEqual(["name", "email", "phone", "custom:company"]);

    const foreign = await createDraftFlow("owner-1", { ...sketch, botId: "other", name: "Nope" });
    expect(foreign.output).toMatchObject({ error: expect.stringContaining("not found") });
    expect(await db.select().from(flows).where(eq(flows.botId, "other"))).toHaveLength(0);

    const broken = await createDraftFlow("owner-1", {
      ...sketch,
      name: "Broken",
      steps: [{ id: "s1", type: "question", text: "Passport?", field: "passport", next: "missing" }],
    });
    expect(broken.draft).toBeUndefined();
    expect(JSON.stringify(broken.output)).toMatch(/missing/);

    const updated = await updateDraftFlow("owner-1", { ...sketch, flowId: created.draft!.id, name: "Guide leads v2" });
    expect(updated.draft?.name).toBe("Guide leads v2");
    const [stillDraft] = await db.select().from(flows).where(eq(flows.id, created.draft!.id));
    expect(stillDraft?.isActive).toBe(false);

    await db.insert(flows).values({
      id: "live",
      botId: "tg",
      name: "Live",
      triggerType: "keyword",
      triggerValue: "hi",
      isActive: true,
      definition: { startStepId: "s1", steps: [{ id: "s1", type: "end", text: "hi" }] },
    });
    const refused = await updateDraftFlow("owner-1", { ...sketch, flowId: "live", name: "Hijack" });
    expect(JSON.stringify(refused.output)).toMatch(/already on/);
    const [live] = await db.select().from(flows).where(eq(flows.id, "live"));
    expect(live?.isActive).toBe(true);
    expect(live?.name).toBe("Live");

    const broadcast = await createDraftBroadcast("owner-1", { botId: "tg", name: "Follow up", body: "Still interested?", tagName: "lead" });
    const [row] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcast.draft!.id));
    expect(row).toMatchObject({ status: "draft", confirmedAt: null, sentCount: 0, tagId: "tag-lead" });
    const leaked = await createDraftBroadcast("owner-2", { botId: "tg", name: "Steal", body: "nope" });
    expect(leaked.draft).toBeUndefined();

    const unknown = await runAgentTool("owner-1", "activate_flow", { flowId: created.draft!.id });
    expect(JSON.stringify(unknown.output)).toMatch(/Unknown tool/);
    const [after] = await db.select().from(flows).where(eq(flows.id, created.draft!.id));
    expect(after?.isActive).toBe(false);
  });

  it("answers from tool results and never marks a draft live", async () => {
    const { runWorkspaceAgent } = await import("@/lib/agent/run");
    let step = 0;
    const complete: AgentComplete = async ({ messages }) => {
      step += 1;
      if (step === 1) {
        return {
          text: "",
          toolCalls: [
            {
              id: "call-1",
              name: "create_draft_flow",
              input: {
                botId: "ig",
                name: "Comment leads",
                triggerType: "comment",
                keywords: "",
                steps: [
                  { id: "s1", type: "message", text: "Thanks for commenting", buttons: [{ label: "Send it", next: "s2" }] },
                  { id: "s2", type: "question", text: "Name?", field: "name", next: "s3" },
                  { id: "s3", type: "question", text: "Email?", field: "email", next: "s4" },
                  { id: "s4", type: "question", text: "Phone?", field: "phone", next: "s5" },
                  { id: "s5", type: "end", text: "We'll follow up." },
                ],
              },
            },
          ],
        };
      }
      const tool = [...messages].reverse().find((message) => message.role === "tool");
      expect(tool && "content" in tool ? tool.content : "").toContain("\"isActive\":false");
      return { text: "I saved Comment leads as a draft on Brand. Open it and turn it on when you are ready.", toolCalls: [] };
    };
    const result = await runWorkspaceAgent({ ownerId: "owner-1", history: [], message: "build out a flow for comments", complete });
    expect(result.reply).toContain("draft");
    expect(result.drafts[0]).toMatchObject({ kind: "flow", name: "Comment leads", botName: "Brand" });
    const { getDb } = await import("@/lib/db");
    const { flows } = await import("@/lib/db/schema");
    const [flow] = await (await getDb()).select().from(flows).where(eq(flows.id, result.drafts[0]!.id));
    expect(flow?.isActive).toBe(false);
    expect(flow?.botId).toBe("ig");
  });
});
