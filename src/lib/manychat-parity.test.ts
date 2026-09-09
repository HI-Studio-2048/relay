import { describe, expect, it } from "vitest";
import { commandsFromFlows } from "@/lib/bot-commands";
import { TRIGGER_NODE_ID, canvasToDefinition, createCanvasNode, definitionToCanvas, engineDefinition } from "@/lib/flow-canvas";
import { SKIP_LABEL, executeFrom, processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { classifyMedia, outboundPreview, telegramMediaField, telegramSendMethod } from "@/lib/media";
import { contactRuleEvents, matchingRules } from "@/lib/rule-types";
import { replyMarkup, SHARE_PHONE_LABEL } from "@/lib/telegram";
import { renderTelegramText, stripTelegramFormatting } from "@/lib/telegram-format";
import type { ContactRecord, FlowDefinition, FlowSessionState } from "@/lib/types";

const contact = (extra: Partial<ContactRecord> = {}): ContactRecord => ({
  id: "c1",
  telegramUserId: "1001",
  username: "daniel",
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags: [],
  subscriptions: [],
  ...extra,
});

const session = (stepId: string, awaitingInput = false): FlowSessionState => ({
  id: "s",
  contactId: "c1",
  flowId: "f",
  stepId,
  awaitingInput,
  status: "active",
});

describe("Telegram rich text", () => {
  it("renders the Markdown subset to Telegram HTML and escapes the rest", () => {
    expect(renderTelegramText("Hi **there** & __you__ ~~old~~ `x<y` [site](https://hi.test)")).toEqual({
      text: 'Hi <b>there</b> &amp; <i>you</i> <s>old</s> <code>x&lt;y</code> <a href="https://hi.test">site</a>',
      parse_mode: "HTML",
    });
  });

  it("leaves plain text alone so legacy messages with < or * still send", () => {
    expect(renderTelegramText("Price < 5 * 2 & more")).toEqual({ text: "Price < 5 * 2 & more" });
    expect(renderTelegramText("snake_case_name stays")).toEqual({ text: "snake_case_name stays" });
  });

  it("strips markers for inbox previews", () => {
    expect(stripTelegramFormatting("**Bold** and [link](https://a.b)")).toBe("Bold and link (https://a.b)");
  });
});

describe("media kinds", () => {
  it("classifies video, audio, and documents and maps them to Telegram methods", () => {
    expect(classifyMedia("video/mp4", "clip.mp4")).toBe("video");
    expect(classifyMedia("", "song.mp3")).toBe("audio");
    expect(classifyMedia("application/pdf", "brochure.pdf")).toBe("document");
    expect(classifyMedia("", "poster.png")).toBe("photo");
    expect(telegramSendMethod({ url: "https://x/y.mp4", kind: "video" })).toBe("sendVideo");
    expect(telegramMediaField({ url: "https://x/y.pdf", kind: "document" })).toBe("document");
    expect(outboundPreview("", { url: "https://x/y.pdf", kind: "document", filename: "y.pdf" })).toBe("[file y.pdf]");
  });

  it("round-trips a video block through a Send Message node", () => {
    const node = createCanvasNode("send_message", { x: 300, y: 0 }, "vid");
    node.data = {
      kind: "send_message",
      blocks: [{ id: "b1", type: "video", text: "Watch", media: { url: "https://cdn/x.mp4", kind: "video" }, buttons: [] }],
      quickReplies: [],
    };
    const graph = {
      nodes: [{ id: TRIGGER_NODE_ID, type: "trigger" as const, position: { x: 0, y: 0 }, data: { kind: "trigger" as const } }, node],
      edges: [{ id: "e", source: TRIGGER_NODE_ID, sourceHandle: "out", target: "vid", targetHandle: "in" }],
    };
    const definition = engineDefinition(canvasToDefinition(graph));
    expect(definition.steps[0]).toMatchObject({ type: "text", text: "Watch", media: { kind: "video" } });
    const back = definitionToCanvas(definition).nodes.find((item) => item.id === "vid");
    expect(back?.data.kind === "send_message" && back.data.blocks[0]?.type).toBe("video");
  });
});

describe("User Input: phone share, Skip, typing indicator", () => {
  const definition: FlowDefinition = {
    startStepId: "ask",
    steps: [
      { id: "ask", type: "capture", field: "phone", prompt: "Your number?", skippable: true, next: "done" },
      { id: "done", type: "end", text: "Thanks." },
    ],
  };
  const flows: FlowRecord[] = [{ id: "f", triggerType: "start", triggerValue: null, isActive: true, definition }];

  it("asks with a share-phone button and a Skip quick reply", () => {
    const result = executeFrom(definition, session("ask"), contact());
    expect(result.replies[0]).toMatchObject({ text: "Your number?", requestContact: true, keyboard: [SKIP_LABEL] });
    expect(replyMarkup(undefined, { keyboard: [SKIP_LABEL], requestContact: true })).toEqual({
      keyboard: [[{ text: SHARE_PHONE_LABEL, request_contact: true }], [{ text: SKIP_LABEL }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
  });

  it("stores a shared Telegram contact card as the phone and clears the keyboard", () => {
    const result = processInboundEvent({
      contact: contact(),
      session: session("ask", true),
      flows,
      event: { telegramUserId: "1001", contactPhone: "+15551234567" },
    });
    expect(result.contact.phone).toBe("+15551234567");
    expect(result.replies[0]).toMatchObject({ text: "Thanks.", removeKeyboard: true });
    expect(result.inboundSaved).toBe(true);
  });

  it("moves on without a value when the contact taps Skip", () => {
    const result = processInboundEvent({
      contact: contact(),
      session: session("ask", true),
      flows,
      event: { telegramUserId: "1001", text: "skip" },
    });
    expect(result.contact.phone).toBeNull();
    expect(result.replies.map((reply) => reply.text)).toEqual(["Thanks."]);
  });

  it("round-trips the Skip option through the canvas", () => {
    const graph = definitionToCanvas(definition);
    const ask = graph.nodes.find((node) => node.id === "ask");
    expect(ask?.data.kind === "capture" && ask.data.skippable).toBe(true);
    expect(engineDefinition(canvasToDefinition(graph)).steps[0]).toMatchObject({ type: "capture", skippable: true });
  });

  it("emits a typing effect for a Send Message typing delay but not for a Smart Delay", () => {
    const grouped: FlowDefinition = {
      startStepId: "m",
      steps: [
        { id: "m", type: "text", text: "One", group: "m", next: "m:pause" },
        { id: "m:pause", type: "delay", seconds: 3, group: "m", next: "m:two" },
        { id: "m:two", type: "text", text: "Two", group: "m" },
      ],
    };
    const now = Date.parse("2026-09-08T10:00:00Z");
    expect(executeFrom(grouped, session("m"), contact(), now).effects).toEqual([{ type: "typing" }]);

    const smart: FlowDefinition = {
      startStepId: "w",
      steps: [
        { id: "w", type: "delay", seconds: 3600, next: "e" },
        { id: "e", type: "end" },
      ],
    };
    expect(executeFrom(smart, session("w"), contact(), now).effects).toEqual([]);
  });
});

describe("bot command menu", () => {
  it("lists active command flows once, normalized for Telegram", () => {
    const commands = commandsFromFlows([
      { triggerType: "command", triggerValue: "/help", isActive: true, name: "Help" },
      { triggerType: "command", triggerValue: "Pricing", isActive: true, name: "Pricing flow" },
      { triggerType: "command", triggerValue: "/help", isActive: true, name: "Duplicate" },
      { triggerType: "command", triggerValue: "/off", isActive: false, name: "Inactive" },
      { triggerType: "keyword", triggerValue: "hi", isActive: true, name: "Keyword" },
      { triggerType: "command", triggerValue: "bad command!", isActive: true, name: "Invalid" },
    ]);
    expect(commands).toEqual([
      { command: "help", description: "Help" },
      { command: "pricing", description: "Pricing flow" },
    ]);
  });
});

describe("rules: contact change events", () => {
  it("detects tag, list, and field changes", () => {
    const before = contact({ tags: ["lead"], subscriptions: ["news"], customFields: { company: "" } });
    const after = contact({ tags: ["vip"], subscriptions: [], customFields: { company: "HI Studio" } });
    expect(contactRuleEvents(before, after)).toEqual([
      { type: "tag_applied", value: "vip" },
      { type: "tag_removed", value: "lead" },
      { type: "unsubscribed", value: "news" },
      { type: "field_set", value: "company" },
    ]);
    expect(contactRuleEvents(null, contact({ tags: ["Lead"] }))).toEqual([{ type: "tag_applied", value: "Lead" }]);
  });

  it("matches rules case-insensitively and skips inactive ones", () => {
    const rules = [
      { id: "1", isActive: true, triggerType: "tag_applied", triggerValue: "VIP", actionType: "add_tag", actionValue: "x" },
      { id: "2", isActive: false, triggerType: "tag_applied", triggerValue: "vip", actionType: "add_tag", actionValue: "y" },
      { id: "3", isActive: true, triggerType: "field_set", triggerValue: "company", actionType: "start_flow", actionValue: "f" },
    ];
    const matched = matchingRules(rules, [{ type: "tag_applied", value: "vip" }]);
    expect(matched.map((rule) => rule.id)).toEqual(["1"]);
  });
});
