import { describe, expect, it } from "vitest";
import { EXAMPLE_GROWTH_LINK_FLOW } from "@/lib/example-flow";
import {
  TRIGGER_NODE_ID,
  buttonHandleId,
  canvasToDefinition,
  comparableDefinition,
  createCanvasNode,
  definitionToCanvas,
  engineDefinition,
  replaceHandleEdge,
  validateCanvas,
} from "@/lib/flow-canvas";
import {
  evaluateCondition,
  executeFrom,
  matchFlowTrigger,
  parseStartPayload,
  processInboundEvent,
  type FlowRecord,
} from "@/lib/flow-engine";
import type { ContactRecord, FlowDefinition, FlowSessionState } from "@/lib/types";

const emptyContact = (tags: string[] = []): ContactRecord => ({
  id: "c1",
  telegramUserId: "1001",
  username: "daniel",
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags,
});

function runFlow(
  flows: FlowRecord[],
  state: { contact: ContactRecord | null; session: FlowSessionState | null },
  event: Parameters<typeof processInboundEvent>[0]["event"],
  now?: number,
) {
  const result = processInboundEvent({
    contact: state.contact,
    session: state.session,
    flows,
    event,
    now,
  });
  state.contact = result.contact;
  state.session = result.session;
  return result;
}

describe("growth-link start params", () => {
  it("parses /start payloads including bot mentions", () => {
    expect(parseStartPayload("/start")).toEqual({ isStart: true, payload: null });
    expect(parseStartPayload("/start promo")).toEqual({ isStart: true, payload: "promo" });
    expect(parseStartPayload("/start@relay_bot Promo")).toEqual({ isStart: true, payload: "Promo" });
    expect(parseStartPayload("hello")).toEqual({ isStart: false, payload: null });
  });

  it("matches start_param before a generic /start flow", () => {
    const generic: FlowRecord = {
      id: "generic",
      triggerType: "start",
      triggerValue: null,
      isActive: true,
      definition: { startStepId: "a", steps: [{ id: "a", type: "end", text: "generic" }] },
    };
    const promo: FlowRecord = {
      id: "promo",
      triggerType: "start_param",
      triggerValue: "promo",
      isActive: true,
      definition: { startStepId: "b", steps: [{ id: "b", type: "end", text: "promo" }] },
    };

    expect(matchFlowTrigger([generic, promo], "/start promo")?.id).toBe("promo");
    expect(matchFlowTrigger([generic, promo], "/start Promo")?.id).toBe("promo");
    expect(matchFlowTrigger([generic, promo], "/start")?.id).toBe("generic");
    expect(matchFlowTrigger([generic, promo], "/start other")?.id).toBe("generic");
  });
});

describe("conditions, tags, forms, delays, and URL buttons", () => {
  it("evaluates tag and field conditions", () => {
    const tagged = emptyContact(["lead"]);
    const withEmail = { ...emptyContact(), email: "daniel@histudio.test" };

    expect(
      evaluateCondition(tagged, {
        id: "c",
        type: "condition",
        check: "tag",
        tagName: "Lead",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(true);
    expect(
      evaluateCondition(emptyContact(), {
        id: "c",
        type: "condition",
        check: "tag",
        tagName: "lead",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(false);
    expect(
      evaluateCondition(withEmail, {
        id: "c",
        type: "condition",
        check: "field",
        field: "email",
        op: "set",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(true);
    expect(
      evaluateCondition(withEmail, {
        id: "c",
        type: "condition",
        check: "field",
        field: "email",
        op: "contains",
        value: "histudio",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(true);
    expect(
      evaluateCondition(withEmail, {
        id: "c",
        type: "condition",
        check: "field",
        field: "email",
        op: "eq",
        value: "other@test",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(false);
  });

  it("subscribes to a list, then unsubscribes globally", () => {
    const definition: FlowDefinition = {
      startStepId: "in",
      steps: [
        { id: "in", type: "subscribe", listName: "newsletter", action: "subscribe", next: "out" },
        { id: "out", type: "subscribe", listName: "all", action: "unsubscribe", next: "done" },
        { id: "done", type: "end", text: "ok" },
      ],
    };
    const subscribed = executeFrom(
      {
        startStepId: "in",
        steps: [
          { id: "in", type: "subscribe", listName: "newsletter", action: "subscribe", next: "done" },
          { id: "done", type: "end", text: "in" },
        ],
      },
      { id: "s", contactId: "c1", flowId: "f", stepId: "in", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(subscribed.contact.tags).toContain("newsletter");
    expect(subscribed.contact.subscriptions).toContain("newsletter");
    expect(subscribed.contact.unsubscribed).toBe(false);
    expect(
      evaluateCondition(subscribed.contact, {
        id: "c",
        type: "condition",
        check: "subscription",
        tagName: "newsletter",
        nextTrue: "y",
        nextFalse: "n",
      }),
    ).toBe(true);

    const stopped = executeFrom(
      definition,
      { id: "s", contactId: "c1", flowId: "f", stepId: "in", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(stopped.contact.unsubscribed).toBe(true);
  });

  it("adds and removes tags", () => {
    const definition: FlowDefinition = {
      startStepId: "add",
      steps: [
        { id: "add", type: "tag", tagName: "lead", action: "add", next: "drop" },
        { id: "drop", type: "tag", tagName: "LEAD", action: "remove", next: "done" },
        { id: "done", type: "end", text: "ok" },
      ],
    };
    const first = executeFrom(
      definition,
      { id: "s", contactId: "c1", flowId: "f", stepId: "add", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(first.contact.tags).toEqual([]);
    expect(first.replies.at(-1)?.text).toBe("ok");
  });

  it("walks a lead form and writes fields in order", () => {
    const flows: FlowRecord[] = [
      {
        id: "form-flow",
        triggerType: "keyword",
        triggerValue: "signup",
        isActive: true,
        definition: {
          startStepId: "form",
          steps: [
            {
              id: "form",
              type: "form",
              intro: "A few details:",
              fields: [
                { field: "name", prompt: "Name?" },
                { field: "email", prompt: "Email?" },
              ],
              next: "done",
            },
            { id: "done", type: "end", text: "Saved." },
          ],
        },
      },
    ];
    const state = { contact: emptyContact(), session: null as FlowSessionState | null };
    const start = runFlow(flows, state, { telegramUserId: "1001", text: "signup" });
    expect(start.replies.map((reply) => reply.text)).toEqual(["A few details:", "Name?"]);
    expect(state.session?.formIndex).toBe(0);
    expect(state.session?.awaitingInput).toBe(true);

    const afterName = runFlow(flows, state, { telegramUserId: "1001", text: "Daniel Philip" });
    expect(afterName.replies.map((reply) => reply.text)).toEqual(["Email?"]);
    expect(state.contact?.firstName).toBe("Daniel");
    expect(state.session?.formIndex).toBe(1);

    const finished = runFlow(flows, state, { telegramUserId: "1001", text: "daniel@histudio.test" });
    expect(state.contact?.email).toBe("daniel@histudio.test");
    expect(finished.session).toBeNull();
    expect(finished.replies.at(-1)?.text).toBe("Saved.");
  });

  it("pauses on a delay and resumes when due", () => {
    const definition: FlowDefinition = {
      startStepId: "wait",
      steps: [
        { id: "wait", type: "delay", seconds: 30, next: "done" },
        { id: "done", type: "end", text: "Later." },
      ],
    };
    const now = Date.parse("2026-09-05T00:00:00.000Z");
    const paused = executeFrom(
      definition,
      { id: "s", contactId: "c1", flowId: "f", stepId: "wait", awaitingInput: false, status: "active" },
      emptyContact(),
      now,
    );
    expect(paused.replies).toEqual([]);
    expect(paused.session?.resumeAt).toBe("2026-09-05T00:00:30.000Z");
    expect(paused.session?.stepId).toBe("wait");

    const resumed = executeFrom(definition, paused.session!, paused.contact, now + 30_000);
    expect(resumed.replies.at(-1)?.text).toBe("Later.");
    expect(resumed.session?.status).toBe("completed");
  });

  it("skips a zero-second delay immediately", () => {
    const definition: FlowDefinition = {
      startStepId: "wait",
      steps: [
        { id: "wait", type: "delay", seconds: 0, next: "done" },
        { id: "done", type: "end", text: "Now." },
      ],
    };
    const result = executeFrom(
      definition,
      { id: "s", contactId: "c1", flowId: "f", stepId: "wait", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(result.replies.at(-1)?.text).toBe("Now.");
    expect(result.session?.status).toBe("completed");
  });

  it("sends URL buttons without pausing, and callback buttons with a session", () => {
    const urlOnly: FlowDefinition = {
      startStepId: "msg",
      steps: [
        {
          id: "msg",
          type: "text",
          text: "Site",
          buttons: [{ text: "Open", url: "https://histudio.test" }],
          next: "done",
        },
        { id: "done", type: "end", text: "After link." },
      ],
    };
    const urlResult = executeFrom(
      urlOnly,
      { id: "s", contactId: "c1", flowId: "f", stepId: "msg", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(urlResult.replies[0]?.buttons).toEqual([{ text: "Open", url: "https://histudio.test" }]);
    expect(urlResult.replies[1]?.text).toBe("After link.");

    const mixed: FlowDefinition = {
      startStepId: "msg",
      steps: [
        {
          id: "msg",
          type: "text",
          text: "Pick",
          buttons: [
            { text: "Site", url: "https://histudio.test" },
            { text: "Go", next: "done" },
          ],
        },
        { id: "done", type: "end", text: "Chosen." },
      ],
    };
    const mixedResult = executeFrom(
      mixed,
      { id: "s", contactId: "c1", flowId: "f", stepId: "msg", awaitingInput: false, status: "active" },
      emptyContact(),
    );
    expect(mixedResult.session?.stepId).toBe("msg");
    expect(mixedResult.replies).toHaveLength(1);
    expect(mixedResult.replies[0]?.buttons).toEqual([
      { text: "Site", url: "https://histudio.test" },
      { text: "Go", data: "n:done" },
    ]);
  });

  it("walks the seeded growth-link flow from /start promo", () => {
    const flows: FlowRecord[] = [
      {
        id: "growth",
        triggerType: "start_param",
        triggerValue: "promo",
        isActive: true,
        definition: EXAMPLE_GROWTH_LINK_FLOW,
      },
    ];
    const state = { contact: emptyContact(), session: null as FlowSessionState | null };
    const start = runFlow(flows, state, { telegramUserId: "1001", text: "/start promo" });
    expect(start.replies[0]?.buttons?.map((button) => button.text)).toEqual(["Continue", "HI Studio site"]);
    expect(start.replies[0]?.buttons?.[1]).toEqual({ text: "HI Studio site", url: "https://histudio.test" });

    runFlow(flows, state, { telegramUserId: "1001", callbackData: "n:lead_form" });
    runFlow(flows, state, { telegramUserId: "1001", text: "Daniel Philip" });
    const finished = runFlow(flows, state, { telegramUserId: "1001", text: "daniel@histudio.test" });
    expect(state.contact?.email).toBe("daniel@histudio.test");
    expect(state.contact?.tags).toContain("qualified");
    expect(state.contact?.subscriptions).toContain("newsletter");
    expect(finished.session).toBeNull();
    expect(finished.replies.at(-1)?.text).toMatch(/promo growth link/);
  });
});

describe("canvas serialize for new step kinds", () => {
  it("round-trips the growth-link example including URL buttons and branches", () => {
    const graph = definitionToCanvas(EXAMPLE_GROWTH_LINK_FLOW);
    expect(graph.nodes.find((node) => node.id === "lead_form")?.type).toBe("form");
    expect(graph.nodes.find((node) => node.id === "has_email")?.type).toBe("condition");
    expect(graph.nodes.find((node) => node.id === "wait")?.type).toBe("delay");
    expect(graph.nodes.find((node) => node.id === "opt_in")?.type).toBe("subscribe");
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: "has_email", sourceHandle: "yes", target: "tag_qualified" }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: "has_email", sourceHandle: "no", target: "wait" }),
    );

    const welcome = graph.nodes.find((node) => node.id === "welcome");
    expect(welcome?.data.kind).toBe("buttons");
    if (welcome?.data.kind === "buttons") {
      expect(welcome.data.buttons[1]?.url).toBe("https://histudio.test");
    }

    const back = canvasToDefinition(graph);
    expect(comparableDefinition(back)).toEqual(comparableDefinition(EXAMPLE_GROWTH_LINK_FLOW));
  });

  it("serializes a condition + delay + form graph built from palette nodes", () => {
    const form = createCanvasNode("form", { x: 300, y: 80 }, "form1");
    const condition = createCanvasNode("condition", { x: 600, y: 80 }, "cond1");
    const delay = createCanvasNode("delay", { x: 900, y: 40 }, "delay1");
    const end = createCanvasNode("end", { x: 900, y: 160 }, "end1");
    const graph = {
      nodes: [
        {
          id: TRIGGER_NODE_ID,
          type: "trigger" as const,
          position: { x: 0, y: 80 },
          data: { kind: "trigger" as const },
        },
        form,
        condition,
        delay,
        end,
      ],
      edges: replaceHandleEdge(
        replaceHandleEdge(
          replaceHandleEdge(
            replaceHandleEdge([], { source: TRIGGER_NODE_ID, sourceHandle: "out", target: "form1" }),
            { source: "form1", sourceHandle: "next", target: "cond1" },
          ),
          { source: "cond1", sourceHandle: "yes", target: "end1" },
        ),
        { source: "cond1", sourceHandle: "no", target: "delay1" },
      ),
    };
    graph.edges = replaceHandleEdge(graph.edges, {
      source: "delay1",
      sourceHandle: "next",
      target: "end1",
    });

    const definition = engineDefinition(canvasToDefinition(graph));
    expect(definition.startStepId).toBe("form1");
    expect(definition.steps.find((step) => step.id === "form1")).toMatchObject({
      type: "form",
      next: "cond1",
    });
    expect(definition.steps.find((step) => step.id === "cond1")).toMatchObject({
      type: "condition",
      nextTrue: "end1",
      nextFalse: "delay1",
    });
    expect(definition.steps.find((step) => step.id === "delay1")).toMatchObject({
      type: "delay",
      seconds: 300,
      next: "end1",
    });
  });

  it("does not require a next handle on URL buttons", () => {
    const buttons = createCanvasNode("buttons", { x: 200, y: 80 }, "btns");
    if (buttons.data.kind !== "buttons") throw new Error("expected buttons");
    buttons.data.buttons = [{ id: buttonHandleId(0), text: "Site", url: "https://histudio.test" }];
    const end = createCanvasNode("end", { x: 500, y: 80 }, "end1");
    const graph = {
      nodes: [
        {
          id: TRIGGER_NODE_ID,
          type: "trigger" as const,
          position: { x: 0, y: 80 },
          data: { kind: "trigger" as const },
        },
        buttons,
        end,
      ],
      edges: replaceHandleEdge([], { source: TRIGGER_NODE_ID, sourceHandle: "out", target: "btns" }),
    };
    const result = validateCanvas(graph);
    expect(result.warnings.some((warning) => /not connected/i.test(warning))).toBe(false);
    const definition = engineDefinition(canvasToDefinition(graph));
    const step = definition.steps.find((item) => item.id === "btns");
    expect(step).toMatchObject({
      type: "text",
      buttons: [{ text: "Site", url: "https://histudio.test" }],
    });
  });
});
