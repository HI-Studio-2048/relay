import { describe, expect, it } from "vitest";
import { generatedToDefinition } from "@/lib/ai-flow";
import { canvasToDefinition, definitionToCanvas, parseCollectList } from "@/lib/flow-canvas";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { readAiSettings } from "@/lib/ai";

const aiFlow: FlowRecord = {
  id: "f1",
  triggerType: "keyword_contains",
  triggerValue: "help",
  isActive: true,
  definition: {
    startStepId: "hi",
    steps: [
      { id: "hi", type: "text", text: "Let me get our assistant.", next: "agent" },
      { id: "agent", type: "ai", goal: "Find their budget", collect: ["budget"], next: "done" },
      { id: "done", type: "end", text: "Thanks!" },
    ],
  },
};

describe("AI step", () => {
  it("sends what comes before it, then parks the session and asks the runtime for a turn", () => {
    const result = processInboundEvent({ contact: null, session: null, flows: [aiFlow], event: { telegramUserId: "u", text: "help me" } });
    expect(result.replies.map((reply) => reply.text)).toEqual(["Let me get our assistant."]);
    expect(result.effects).toEqual([{ type: "ai_turn", flowId: "f1", stepId: "agent" }]);
    expect(result.session).toMatchObject({ stepId: "agent", awaitingInput: true });
  });

  it("routes every later message back to the AI instead of keyword matching", () => {
    const first = processInboundEvent({ contact: null, session: null, flows: [aiFlow], event: { telegramUserId: "u", text: "help" } });
    const next = processInboundEvent({
      contact: first.contact,
      session: first.session,
      flows: [aiFlow],
      event: { telegramUserId: "u", text: "help, about 5k" },
    });
    expect(next.replies).toEqual([]);
    expect(next.effects).toEqual([{ type: "ai_turn", flowId: "f1", stepId: "agent" }]);
    expect(next.session?.stepId).toBe("agent");
  });

  it("round-trips through the canvas", () => {
    const graph = definitionToCanvas(aiFlow.definition);
    const node = graph.nodes.find((item) => item.id === "agent");
    expect(node?.data).toEqual({ kind: "ai", goal: "Find their budget", collect: "budget" });
    const back = canvasToDefinition(graph);
    expect(back.steps.find((step) => step.id === "agent")).toEqual({
      id: "agent",
      type: "ai",
      goal: "Find their budget",
      collect: ["budget"],
      next: "done",
    });
  });

  it("normalizes collect lists", () => {
    expect(parseCollectList("Email, phone,\nBudget range, email")).toEqual(["email", "phone", "budget_range"]);
  });

  it("reads AI settings defensively", () => {
    expect(readAiSettings(null)).toEqual({ persona: "", knowledge: "", autoReply: false, handoffMessage: "" });
    expect(readAiSettings({ ai: { autoReply: "yes", persona: 4 } }).autoReply).toBe(true);
  });
});

describe("AI flow builder", () => {
  it("turns a sketch into a runnable comment-to-DM flow", () => {
    const built = generatedToDefinition({
      name: "Guide",
      trigger: { type: "comment", keywords: "guide", public_replies: ["Check your DMs!", " "] },
      steps: [
        { id: "s1", type: "message", text: "Want the guide?", buttons: [{ label: "Yes", next: "s2", url: "" }], field: "", tag: "", minutes: 0, next: "" },
        { id: "s2", type: "question", text: "Your email?", buttons: [], field: "Email", tag: "", minutes: 0, next: "" },
        { id: "s3", type: "tag", text: "", buttons: [], field: "", tag: "guide", minutes: 0, next: "" },
        { id: "s4", type: "delay", text: "", buttons: [], field: "", tag: "", minutes: 60, next: "" },
        { id: "s5", type: "end", text: "Here: https://x.co", buttons: [], field: "", tag: "", minutes: 0, next: "ghost" },
      ],
    });
    expect(built.triggerType).toBe("comment");
    expect(built.triggerValue).toBe("guide");
    expect(built.definition.trigger?.publicReplies).toEqual(["Check your DMs!"]);
    const [s1, s2, s3, s4, s5] = built.definition.steps;
    expect(s1).toEqual({ id: "s1", type: "text", text: "Want the guide?", buttons: [{ text: "Yes", next: "s2" }] });
    expect(s2).toMatchObject({ type: "capture", field: "email", next: "s3" });
    expect(s3).toMatchObject({ type: "tag", tagName: "guide", next: "s4" });
    expect(s4).toMatchObject({ type: "delay", seconds: 3600, unit: "hours", next: "s5" });
    expect(s5).toEqual({ id: "s5", type: "end", text: "Here: https://x.co" });
  });

  it("dedupes ids and keeps custom capture fields", () => {
    const built = generatedToDefinition({
      name: "",
      trigger: { type: "start", keywords: "", public_replies: [] },
      steps: [
        { id: "a b", type: "question", text: "Budget?", buttons: [], field: "Budget Range", tag: "", minutes: 0, next: "" },
        { id: "ab", type: "end", text: "", buttons: [], field: "", tag: "", minutes: 0, next: "" },
      ],
    });
    expect(built.name).toBe("AI-built flow");
    expect(built.triggerValue).toBe("/start");
    expect(built.definition.steps.map((step) => step.id)).toEqual(["ab", "ab_1"]);
    expect(built.definition.steps[0]).toMatchObject({ field: "custom:budget_range", next: "ab_1" });
  });
});
