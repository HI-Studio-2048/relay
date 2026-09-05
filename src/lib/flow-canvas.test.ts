import { describe, expect, it } from "vitest";
import { EXAMPLE_LEAD_CAPTURE_FLOW } from "@/lib/example-flow";
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
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord, FlowSessionState } from "@/lib/types";

describe("flow canvas serialize/deserialize", () => {
  it("round-trips the seeded lead-capture flow without changing engine steps", () => {
    const graph = definitionToCanvas(EXAMPLE_LEAD_CAPTURE_FLOW);
    const back = canvasToDefinition(graph);

    expect(comparableDefinition(back)).toEqual(comparableDefinition(EXAMPLE_LEAD_CAPTURE_FLOW));
    expect(engineDefinition(back)).toEqual(EXAMPLE_LEAD_CAPTURE_FLOW);
  });

  it("maps the trigger edge to startStepId and button handles to button.next", () => {
    const graph = definitionToCanvas(EXAMPLE_LEAD_CAPTURE_FLOW);

    expect(graph.nodes.some((node) => node.id === TRIGGER_NODE_ID)).toBe(true);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: TRIGGER_NODE_ID,
        sourceHandle: "out",
        target: "welcome",
      }),
    );

    const yes = graph.edges.find(
      (edge) => edge.source === "welcome" && edge.sourceHandle === buttonHandleId(0),
    );
    const later = graph.edges.find(
      (edge) => edge.source === "welcome" && edge.sourceHandle === buttonHandleId(1),
    );
    expect(yes?.target).toBe("ask_name");
    expect(later?.target).toBe("later");

    const welcome = graph.nodes.find((node) => node.id === "welcome");
    expect(welcome?.type).toBe("buttons");
    if (welcome?.data.kind === "buttons") {
      expect(welcome.data.buttons.map((button) => button.text)).toEqual(["Yes, let's go", "Not now"]);
    }
  });

  it("keeps capture / tag / end next links", () => {
    const graph = definitionToCanvas(EXAMPLE_LEAD_CAPTURE_FLOW);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: "ask_name", sourceHandle: "next", target: "ask_email" }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: "tag_lead", sourceHandle: "next", target: "thanks" }),
    );
    expect(graph.nodes.find((node) => node.id === "thanks")?.type).toBe("end");
  });

  it("persists canvas positions and restores them on load", () => {
    const graph = definitionToCanvas(EXAMPLE_LEAD_CAPTURE_FLOW);
    const moved = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === "welcome" ? { ...node, position: { x: 900, y: 40 } } : node,
      ),
    };
    const saved = canvasToDefinition(moved);
    expect(saved.canvas?.nodes.welcome).toEqual({ x: 900, y: 40 });

    const reloaded = definitionToCanvas(saved);
    expect(reloaded.nodes.find((node) => node.id === "welcome")?.position).toEqual({ x: 900, y: 40 });
  });

  it("serializes a newly created capture connected from a message", () => {
    const message = createCanvasNode("message", { x: 300, y: 80 }, "msg1");
    const capture = createCanvasNode("capture", { x: 600, y: 80 }, "cap1");
    const end = createCanvasNode("end", { x: 900, y: 80 }, "end1");
    const graph = {
      nodes: [
        {
          id: TRIGGER_NODE_ID,
          type: "trigger" as const,
          position: { x: 0, y: 80 },
          data: { kind: "trigger" as const },
        },
        message,
        capture,
        end,
      ],
      edges: replaceHandleEdge(
        replaceHandleEdge(
          replaceHandleEdge([], {
            source: TRIGGER_NODE_ID,
            sourceHandle: "out",
            target: "msg1",
          }),
          { source: "msg1", sourceHandle: "next", target: "cap1" },
        ),
        { source: "cap1", sourceHandle: "next", target: "end1" },
      ),
    };

    const definition = engineDefinition(canvasToDefinition(graph));
    expect(definition.startStepId).toBe("msg1");
    expect(definition.steps).toEqual([
      { id: "msg1", type: "text", text: "Hello.", next: "cap1" },
      {
        id: "cap1",
        type: "capture",
        field: "name",
        prompt: "What's your name?",
        next: "end1",
      },
      { id: "end1", type: "end", text: "Done." },
    ]);
  });

  it("replaceHandleEdge keeps a single outgoing connection per handle", () => {
    const once = replaceHandleEdge([], { source: "a", sourceHandle: "next", target: "b" });
    const twice = replaceHandleEdge(once, { source: "a", sourceHandle: "next", target: "c" });
    expect(twice).toHaveLength(1);
    expect(twice[0]?.target).toBe("c");
  });

  it("flags a missing trigger connection", () => {
    const graph = definitionToCanvas({ startStepId: "", steps: [] });
    const result = validateCanvas(graph);
    expect(result.errors.some((error) => /trigger/i.test(error))).toBe(true);
  });
});

describe("engine compatibility after a canvas round-trip", () => {
  const emptyContact = (): ContactRecord => ({
    id: "c1",
    telegramUserId: "1001",
    username: "daniel",
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    customFields: {},
    tags: [],
  });

  it("still walks the seeded /start lead-capture path", () => {
    const definition = canvasToDefinition(definitionToCanvas(EXAMPLE_LEAD_CAPTURE_FLOW));
    const flows: FlowRecord[] = [
      {
        id: "flow-lead",
        triggerType: "start",
        triggerValue: null,
        isActive: true,
        definition,
      },
    ];
    const state: { contact: ContactRecord | null; session: FlowSessionState | null } = {
      contact: emptyContact(),
      session: null,
    };

    const run = (event: Parameters<typeof processInboundEvent>[0]["event"]) => {
      const result = processInboundEvent({
        contact: state.contact,
        session: state.session,
        flows,
        event,
      });
      state.contact = result.contact;
      state.session = result.session;
      return result;
    };

    const start = run({ telegramUserId: "1001", username: "daniel", text: "/start" });
    expect(start.replies[0]?.buttons?.map((button) => button.text)).toContain("Yes, let's go");

    run({ telegramUserId: "1001", callbackData: "n:ask_name" });
    run({ telegramUserId: "1001", text: "Daniel Philip" });
    run({ telegramUserId: "1001", text: "daniel@histudio.test" });
    run({ telegramUserId: "1001", text: "+15551212" });
    const finished = run({ telegramUserId: "1001", text: "HI Studio" });

    expect(state.contact?.email).toBe("daniel@histudio.test");
    expect(state.contact?.customFields.company).toBe("HI Studio");
    expect(state.contact?.tags).toContain("lead");
    expect(finished.session).toBeNull();
  });
});
