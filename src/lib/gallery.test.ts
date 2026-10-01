import { describe, expect, it } from "vitest";
import { cardsAsReplies } from "@/lib/channels/cards";
import { buildMetaMessages } from "@/lib/channels/meta";
import { buildZernioMessages } from "@/lib/channels/zernio";
import { canvasToDefinition, createCanvasNode, definitionToCanvas, engineDefinition } from "@/lib/flow-canvas";
import { processInboundEvent, typedButton, type FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord, FlowDefinition } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "u1",
  username: null,
  firstName: "Ana",
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags: [],
};

const definition: FlowDefinition = {
  startStepId: "g",
  steps: [
    {
      id: "g",
      type: "gallery",
      text: "Pick a plan 👇",
      cards: [
        { title: "Starter", subtitle: "$29", imageUrl: "https://x.test/a.png", buttons: [{ text: "Choose Starter", next: "starter" }] },
        { title: "Pro", subtitle: "$79", url: "https://x.test/pro", buttons: [{ text: "Choose Pro", next: "pro" }, { text: "Details", url: "https://x.test/pro" }] },
      ],
    },
    { id: "starter", type: "end", text: "Starter it is" },
    { id: "pro", type: "end", text: "Pro it is" },
  ],
};

const flows: FlowRecord[] = [{ id: "f", triggerType: "keyword", triggerValue: "plans", isActive: true, definition }];

describe("gallery step", () => {
  it("sends cards and waits for a card button", () => {
    const first = processInboundEvent({ contact, session: null, flows, event: { telegramUserId: "u1", text: "plans" } });
    expect(first.replies).toHaveLength(1);
    expect(first.replies[0]!.cards?.map((card) => card.title)).toEqual(["Starter", "Pro"]);
    expect(first.replies[0]!.cards?.[1]!.buttons).toEqual([
      { text: "Choose Pro", data: "n:pro" },
      { text: "Details", url: "https://x.test/pro" },
    ]);
    expect(first.session?.stepId).toBe("g");

    const tap = processInboundEvent({ contact: first.contact, session: first.session, flows, event: { telegramUserId: "u1", callbackData: "n:pro" } });
    expect(tap.replies[0]!.text).toBe("Pro it is");
  });

  it("maps a typed number across all cards' buttons", () => {
    const map = new Map(flows.map((flow) => [flow.id, flow]));
    const session = { id: "s", contactId: "c1", flowId: "f", stepId: "g", awaitingInput: false, status: "active" as const };
    expect(typedButton(session, map, "2")).toEqual({ stepId: "g", next: "pro" });
    expect(typedButton(session, map, "3")).toBeNull(); // URL button
    expect(typedButton(session, map, "choose pro")).toEqual({ stepId: "g", next: "pro" });
  });

  it("numbers card buttons across the gallery on networks without buttons", () => {
    const reply = processInboundEvent({ contact, session: null, flows, event: { telegramUserId: "u1", text: "plans" } }).replies[0]!;
    const parts = cardsAsReplies(reply);
    expect(parts.map((part) => part.buttonNumberOffset)).toEqual([undefined, 0, 1]);
    const pro = buildZernioMessages(parts[2]!, "twitter")[0]!;
    expect(pro.message).toContain("2. Choose Pro");
  });

  it("round-trips through the canvas", () => {
    const graph = definitionToCanvas(definition);
    const node = graph.nodes.find((item) => item.id === "g")!;
    expect(node.data.kind).toBe("gallery");
    expect(graph.edges.map((edge) => edge.sourceHandle).sort()).toEqual(["btn-0", "btn-1", "out"]);
    const back = engineDefinition(canvasToDefinition(graph));
    expect(back.steps.find((step) => step.id === "g")).toEqual(definition.steps[0]);
    expect(createCanvasNode("gallery", { x: 0, y: 0 }).data.kind).toBe("gallery");
  });

  it("is a native carousel on Instagram and one message per card elsewhere", () => {
    const reply = processInboundEvent({ contact, session: null, flows, event: { telegramUserId: "u1", text: "plans" } }).replies[0]!;
    const meta = buildMetaMessages(reply, "instagram");
    expect(meta[0]).toEqual({ text: "Pick a plan 👇" });
    const payload = (meta[1]!.attachment as { payload: { template_type: string; elements: { title: string; image_url?: string; default_action?: unknown }[] } }).payload;
    expect(payload.template_type).toBe("generic");
    expect(payload.elements.map((element) => element.title)).toEqual(["Starter", "Pro"]);
    expect(payload.elements[0]!.image_url).toBe("https://x.test/a.png");
    expect(payload.elements[1]!.default_action).toEqual({ type: "web_url", url: "https://x.test/pro" });

    const parts = cardsAsReplies(reply);
    expect(parts).toHaveLength(3);
    expect(parts[1]!.text).toBe("Starter\n$29");
    expect(parts[1]!.media).toEqual({ url: "https://x.test/a.png", kind: "photo" });
    expect(parts[2]!.buttons?.[0]).toEqual({ text: "Choose Pro", data: "n:pro" });
    expect(parts.every((part) => !part.cards)).toBe(true);
  });
});
