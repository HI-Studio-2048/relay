import { describe, expect, it } from "vitest";
import {
  TRIGGER_NODE_ID,
  buttonHandleId,
  canvasEdgeLabel,
  canvasToDefinition,
  createCanvasNode,
  definitionToCanvas,
  engineDefinition,
  quickReplyHandleId,
  validateCanvas,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
} from "@/lib/flow-canvas";
import { executeFrom, processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { replyMarkup } from "@/lib/telegram";
import type { ContactRecord, FlowDefinition, FlowSessionState } from "@/lib/types";

const contact = (): ContactRecord => ({
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

const session = (stepId: string, awaitingInput = false): FlowSessionState => ({
  id: "s",
  contactId: "c1",
  flowId: "f",
  stepId,
  awaitingInput,
  status: "active",
});

function trigger(): CanvasNode {
  return { id: TRIGGER_NODE_ID, type: "trigger", position: { x: 0, y: 0 }, data: { kind: "trigger" } };
}

function edge(source: string, sourceHandle: string, target: string): CanvasEdge {
  return { id: `${source}:${sourceHandle}->${target}`, source, sourceHandle, target, targetHandle: "in" };
}

/** A ManyChat-style node: text with a button, a typing delay, an image, then a closing text with quick replies. */
function richMessageGraph(): CanvasGraph {
  const message = createCanvasNode("send_message", { x: 300, y: 0 }, "hello");
  message.data = {
    kind: "send_message",
    blocks: [
      { id: "intro", type: "text", text: "Welcome to HI Studio", buttons: [{ id: buttonHandleId(0), text: "Pricing" }] },
      { id: "pause", type: "delay", seconds: 2 },
      {
        id: "pic",
        type: "image",
        text: "Our studio",
        media: { url: "https://cdn.example/studio.jpg", kind: "photo" },
        buttons: [{ id: buttonHandleId(1), text: "Site", url: "https://histudio.test" }],
      },
      { id: "ask", type: "text", text: "Want a call?", buttons: [] },
    ],
    quickReplies: [
      { id: quickReplyHandleId(0), text: "Yes" },
      { id: quickReplyHandleId(1), text: "No" },
    ],
  };
  const pricing = createCanvasNode("end", { x: 600, y: 0 }, "pricing");
  const yes = createCanvasNode("end", { x: 600, y: 200 }, "yes");
  const no = createCanvasNode("end", { x: 600, y: 400 }, "no");
  return {
    nodes: [trigger(), message, pricing, yes, no],
    edges: [
      edge(TRIGGER_NODE_ID, "out", "hello"),
      edge("hello", buttonHandleId(0), "pricing"),
      edge("hello", quickReplyHandleId(0), "yes"),
      edge("hello", quickReplyHandleId(1), "no"),
    ],
  };
}

describe("Send Message node compiles to a chain of engine steps", () => {
  it("emits one step per block, linked by next and tagged with the node id", () => {
    const definition = engineDefinition(canvasToDefinition(richMessageGraph()));
    expect(definition.startStepId).toBe("hello");
    expect(definition.steps.map((step) => step.id)).toEqual(["hello", "hello:pause", "hello:pic", "hello:ask", "pricing", "yes", "no"]);

    const [intro, pause, pic, ask] = definition.steps;
    expect(intro).toMatchObject({ type: "text", text: "Welcome to HI Studio", group: "hello", next: "hello:pause" });
    expect(intro?.type === "text" && intro.buttons).toEqual([{ text: "Pricing", next: "pricing" }]);
    expect(pause).toMatchObject({ type: "delay", seconds: 2, group: "hello", next: "hello:pic" });
    expect(pic).toMatchObject({ type: "text", group: "hello", next: "hello:ask" });
    expect(pic?.type === "text" && pic.media?.url).toBe("https://cdn.example/studio.jpg");
    expect(ask).toMatchObject({
      type: "text",
      text: "Want a call?",
      group: "hello",
      quickReplies: [
        { text: "Yes", next: "yes" },
        { text: "No", next: "no" },
      ],
    });
    expect(ask && "next" in ask ? ask.next : undefined).toBeUndefined();
  });

  it("folds the chain back into a single node with blocks, buttons, and quick replies", () => {
    const definition = canvasToDefinition(richMessageGraph());
    const graph = definitionToCanvas(definition);

    const message = graph.nodes.find((node) => node.id === "hello");
    expect(message?.data.kind).toBe("send_message");
    expect(graph.nodes.some((node) => node.id.startsWith("hello:"))).toBe(false);
    if (message?.data.kind !== "send_message") return;

    expect(message.data.blocks.map((block) => block.type)).toEqual(["text", "delay", "image", "text"]);
    expect(message.data.blocks.map((block) => block.id)).toEqual(["b0", "pause", "pic", "ask"]);
    expect(message.data.quickReplies.map((reply) => reply.text)).toEqual(["Yes", "No"]);

    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "hello", sourceHandle: buttonHandleId(0), target: "pricing" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "hello", sourceHandle: quickReplyHandleId(0), target: "yes" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "hello", sourceHandle: quickReplyHandleId(1), target: "no" }));

    // A second save produces the same engine steps.
    expect(engineDefinition(canvasToDefinition(graph))).toEqual(engineDefinition(definition));
  });

  it("labels button and quick reply edges", () => {
    const graph = richMessageGraph();
    expect(canvasEdgeLabel(graph.nodes, edge("hello", buttonHandleId(0), "pricing"))).toBe("Pricing");
    expect(canvasEdgeLabel(graph.nodes, edge("hello", quickReplyHandleId(1), "no"))).toBe("No");
    expect(canvasEdgeLabel(graph.nodes, edge("hello", "next", "no"))).toBeUndefined();
  });

  it("keeps a single text block as a plain text step without a group", () => {
    const node = createCanvasNode("send_message", { x: 300, y: 0 }, "solo");
    const graph: CanvasGraph = {
      nodes: [trigger(), node, createCanvasNode("end", { x: 600, y: 0 }, "done")],
      edges: [edge(TRIGGER_NODE_ID, "out", "solo"), edge("solo", "next", "done")],
    };
    const definition = engineDefinition(canvasToDefinition(graph));
    expect(definition.steps[0]).toEqual({ id: "solo", type: "text", text: "Hello.", next: "done" });
  });

  it("warns about unconnected quick replies and empty blocks", () => {
    const graph = richMessageGraph();
    graph.edges = graph.edges.filter((item) => item.sourceHandle !== quickReplyHandleId(1));
    const result = validateCanvas(graph);
    expect(result.warnings.some((warning) => /Quick reply “No” is not connected/.test(warning))).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("engine sends every block and waits on quick replies", () => {
  const definition = (): FlowDefinition => engineDefinition(canvasToDefinition(richMessageGraph()));

  it("continues past a block with buttons, pauses on the typing delay, then resumes", () => {
    const now = Date.parse("2026-09-08T10:00:00Z");
    const first = executeFrom(definition(), session("hello"), contact(), now);
    expect(first.replies.map((reply) => reply.text)).toEqual(["Welcome to HI Studio"]);
    expect(first.replies[0]?.buttons).toEqual([{ text: "Pricing", data: "n:pricing" }]);
    expect(first.session?.stepId).toBe("hello:pause");
    expect(first.session?.resumeAt).toBe(new Date(now + 2000).toISOString());

    const resumed = executeFrom(definition(), first.session!, contact(), now + 2000);
    expect(resumed.replies.map((reply) => reply.text)).toEqual(["Our studio", "Want a call?"]);
    expect(resumed.replies[0]?.media?.url).toBe("https://cdn.example/studio.jpg");
    expect(resumed.replies[0]?.buttons).toEqual([{ text: "Site", url: "https://histudio.test" }]);
    expect(resumed.replies[1]?.keyboard).toEqual(["Yes", "No"]);
    expect(resumed.replies[1]?.buttons).toBeUndefined();
    expect(resumed.session).toMatchObject({ stepId: "hello:ask", awaitingInput: true });
  });

  it("routes a tapped quick reply to its branch and clears the keyboard", () => {
    const flows: FlowRecord[] = [
      { id: "f", triggerType: "start", triggerValue: null, isActive: true, definition: definition() },
    ];
    const result = processInboundEvent({
      contact: contact(),
      session: session("hello:ask", true),
      flows,
      event: { telegramUserId: "1001", text: "yes" },
    });
    expect(result.replies.map((reply) => reply.text)).toEqual(["Done."]);
    expect(result.replies[0]?.removeKeyboard).toBe(true);
    expect(result.session).toBeNull();
  });

  it("falls through to keyword matching when the text is not a quick reply", () => {
    const flows: FlowRecord[] = [
      { id: "f", triggerType: "start", triggerValue: null, isActive: true, definition: definition() },
      {
        id: "kw",
        triggerType: "keyword",
        triggerValue: "hours",
        isActive: true,
        definition: { startStepId: "h", steps: [{ id: "h", type: "end", text: "9 to 5." }] },
      },
    ];
    const result = processInboundEvent({
      contact: contact(),
      session: session("hello:ask", true),
      flows,
      event: { telegramUserId: "1001", text: "hours" },
    });
    expect(result.replies.map((reply) => reply.text)).toEqual(["9 to 5."]);
  });

  it("renders quick replies as inline callbacks when the block already has buttons", () => {
    const both: FlowDefinition = {
      startStepId: "m",
      steps: [
        {
          id: "m",
          type: "text",
          text: "Pick",
          buttons: [{ text: "Site", url: "https://histudio.test" }],
          quickReplies: [{ text: "Yes", next: "y" }],
        },
        { id: "y", type: "end", text: "Great." },
      ],
    };
    const result = executeFrom(both, session("m"), contact());
    expect(result.replies[0]?.buttons).toEqual([
      { text: "Site", url: "https://histudio.test" },
      { text: "Yes", data: "n:y" },
    ]);
    expect(result.replies[0]?.keyboard).toBeUndefined();
  });
});

describe("Telegram reply markup", () => {
  it("builds a one-time reply keyboard, two quick replies per row", () => {
    expect(replyMarkup(undefined, { keyboard: ["Yes", "No", "Later"] })).toEqual({
      keyboard: [[{ text: "Yes" }, { text: "No" }], [{ text: "Later" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
  });

  it("prefers inline buttons, and can remove a keyboard", () => {
    expect(replyMarkup([{ text: "Go", data: "n:x" }], { keyboard: ["Yes"] })).toEqual({
      inline_keyboard: [[{ text: "Go", callback_data: "n:x" }]],
    });
    expect(replyMarkup(undefined, { removeKeyboard: true })).toEqual({ remove_keyboard: true });
    expect(replyMarkup(undefined, undefined)).toBeUndefined();
  });
});
