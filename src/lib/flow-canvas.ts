import { stepButtons } from "@/lib/types";
import type {
  CaptureField,
  ConditionCheck,
  ConditionOp,
  ConditionRule,
  FlowCanvasLayout,
  FlowDefinition,
  FlowMedia,
  FlowStep,
  FormField,
  HttpMethod,
  SetFieldMode,
  SubscribeAction,
  TagAction,
} from "@/lib/types";

export const TRIGGER_NODE_ID = "__trigger";

export type CanvasNodeKind =
  | "trigger"
  | "send_message"
  | "gallery"
  | "message"
  | "media"
  | "buttons"
  | "capture"
  | "form"
  | "tag"
  | "set_field"
  | "subscribe"
  | "delay"
  | "condition"
  | "start_flow"
  | "http"
  | "notify"
  | "randomizer"
  | "ai"
  | "goal"
  | "end";

export type CanvasButton = {
  id: string;
  text: string;
  url?: string;
};

/** One content block inside a ManyChat-style Send Message node. */
/** ManyChat media block kinds, mapped onto Telegram send methods via FlowMediaKind. */
export type MediaBlockType = "image" | "video" | "audio" | "file";

export type MessageBlock =
  | { id: string; type: "text"; text: string; buttons: CanvasButton[] }
  | { id: string; type: MediaBlockType; text: string; media?: FlowMedia; buttons: CanvasButton[] }
  | { id: string; type: "delay"; seconds: number };

export const MEDIA_BLOCK_TYPES: MediaBlockType[] = ["image", "video", "audio", "file"];

export function isMediaBlock(
  block: MessageBlock,
): block is Extract<MessageBlock, { type: MediaBlockType }> {
  return (MEDIA_BLOCK_TYPES as string[]).includes(block.type);
}

export function mediaBlockTypeFor(kind: FlowMedia["kind"] | undefined): MediaBlockType {
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "document") return "file";
  return "image";
}

/** One card in a Gallery node. Button ids are handle ids unique across the whole node. */
export type CanvasCard = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  url: string;
  buttons: CanvasButton[];
};

export const MAX_GALLERY_CARDS = 10;

export type CanvasQuickReply = {
  id: string;
  text: string;
};

export type SendMessageData = {
  kind: "send_message";
  blocks: MessageBlock[];
  quickReplies: CanvasQuickReply[];
};

export type CanvasNodeData =
  | { kind: "trigger" }
  | SendMessageData
  | { kind: "gallery"; text: string; cards: CanvasCard[] }
  | { kind: "message"; text: string; media?: FlowMedia }
  | { kind: "media"; text: string; media?: FlowMedia }
  | { kind: "buttons"; text: string; buttons: CanvasButton[]; media?: FlowMedia }
  | { kind: "capture"; field: CaptureField; prompt: string; skippable?: boolean }
  | { kind: "form"; intro: string; fields: FormField[] }
  | { kind: "tag"; tagName: string; action: TagAction }
  | { kind: "set_field"; field: CaptureField; value: string; mode?: SetFieldMode }
  | { kind: "subscribe"; listName: string; action: SubscribeAction }
  | { kind: "delay"; seconds: number; unit?: "seconds" | "minutes" | "hours" | "days"; sendAfter?: string; sendBefore?: string }
  | { kind: "randomizer"; sticky: boolean; paths: { id: string; percent: number }[] }
  | {
      kind: "condition";
      check: ConditionCheck;
      tagName: string;
      field: CaptureField;
      op: ConditionOp;
      extra?: ConditionRule[];
      match?: "all" | "any";
      value: string;
    }
  | { kind: "start_flow"; flowId: string }
  | { kind: "http"; url: string; method: HttpMethod; body: string }
  | { kind: "notify"; text: string }
  | { kind: "ai"; goal: string; collect: string }
  | { kind: "goal"; name: string; value: string }
  | { kind: "end"; text?: string };

export type CanvasNode = {
  id: string;
  type: CanvasNodeKind;
  position: { x: number; y: number };
  data: CanvasNodeData;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
};

export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

const COL_W = 300;
const ROW_H = 176;
const ORIGIN_X = 48;
const ORIGIN_Y = 64;

export function newStepId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function buttonHandleId(index: number): string {
  return `btn-${index}`;
}

export function nextButtonHandleId(buttons: CanvasButton[]): string {
  const used = new Set(buttons.map((button) => button.id));
  let index = 0;
  while (used.has(buttonHandleId(index))) index += 1;
  return buttonHandleId(index);
}

export function quickReplyHandleId(index: number): string {
  return `qr-${index}`;
}

export function nextQuickReplyHandleId(replies: CanvasQuickReply[]): string {
  const used = new Set(replies.map((reply) => reply.id));
  let index = 0;
  while (used.has(quickReplyHandleId(index))) index += 1;
  return quickReplyHandleId(index);
}

export function newBlockId(): string {
  return `b-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
}

/** Every button across all blocks of a Send Message node, in send order. */
export function messageNodeButtons(data: SendMessageData): CanvasButton[] {
  return data.blocks.flatMap((block) => (block.type === "delay" ? [] : block.buttons));
}

export const MAX_MESSAGE_BLOCKS = 10;
export const MAX_QUICK_REPLIES = 10;
/** Telegram typing delays inside a message are short; longer waits belong in a Smart Delay node. */
export const MAX_TYPING_DELAY_SECONDS = 60;

export function edgeId(source: string, sourceHandle: string, target: string): string {
  return `e:${source}:${sourceHandle}->${target}`;
}

export function canvasEdgeLabel(nodes: CanvasNode[], edge: CanvasEdge): string | undefined {
  if (edge.sourceHandle === "yes") return "Yes";
  if (edge.sourceHandle === "no") return "No";
  const randomizer = nodes.find((node) => node.id === edge.source);
  if (randomizer?.data.kind === "randomizer") {
    const path = randomizer.data.paths.find((item) => item.id === edge.sourceHandle);
    if (path) return `${path.percent}%`;
  }
  const source = nodes.find((node) => node.id === edge.source);
  if (source?.data.kind === "send_message") {
    if (edge.sourceHandle === "next") return undefined;
    const button = messageNodeButtons(source.data).find((item) => item.id === edge.sourceHandle);
    if (button) return button.text.trim() || undefined;
    const reply = source.data.quickReplies.find((item) => item.id === edge.sourceHandle);
    return reply?.text.trim() || undefined;
  }
  if (source?.data.kind === "gallery") {
    if (edge.sourceHandle === "next") return undefined;
    return source.data.cards.flatMap((card) => card.buttons).find((item) => item.id === edge.sourceHandle)?.text.trim() || undefined;
  }
  if (source?.data.kind !== "buttons") return undefined;
  const label = source.data.buttons.find((button) => button.id === edge.sourceHandle)?.text.trim();
  return label || undefined;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function childrenOf(definition: FlowDefinition, id: string): string[] {
  if (id === TRIGGER_NODE_ID) return definition.startStepId ? [definition.startStepId] : [];
  const step = definition.steps.find((item) => item.id === id);
  if (!step) return [];
  if (step.type === "end") return [];
  if (step.type === "condition") return unique([step.nextTrue, step.nextFalse]);
  if (step.type === "randomizer") return unique(step.paths.map((path) => path.next ?? ""));
  if (step.type === "gallery") {
    return unique([...stepButtons(step).map((button) => button.next ?? ""), step.next ?? ""]);
  }
  if (step.type === "text") {
    return unique([
      ...(step.buttons ?? []).map((button) => button.next ?? ""),
      ...(step.quickReplies ?? []).map((reply) => reply.next ?? ""),
      step.next ?? "",
    ]);
  }
  return "next" in step && step.next ? [step.next] : [];
}

type ChainStep = Extract<FlowStep, { type: "text" | "delay" }>;

function isChainStep(step: FlowStep | undefined): step is ChainStep {
  return step?.type === "text" || step?.type === "delay";
}

/** Follow `group` + `next` from a Send Message head step through its continuation blocks. */
function collectChain(definition: FlowDefinition, head: ChainStep): ChainStep[] {
  const chain: ChainStep[] = [head];
  const seen = new Set<string>([head.id]);
  let current: ChainStep = head;
  while (current.group === head.id && current.next && !seen.has(current.next)) {
    const next = definition.steps.find((step) => step.id === current.next);
    if (!isChainStep(next) || next.group !== head.id) break;
    seen.add(next.id);
    chain.push(next);
    current = next;
  }
  return chain;
}

/** Ids of steps folded into another node's Send Message chain. */
function continuationStepIds(definition: FlowDefinition): Set<string> {
  const folded = new Set<string>();
  for (const step of definition.steps) {
    if (!isChainStep(step) || step.group !== step.id) continue;
    for (const member of collectChain(definition, step).slice(1)) folded.add(member.id);
  }
  return folded;
}

export function autoLayout(definition: FlowDefinition): Record<string, { x: number; y: number }> {
  const layer = new Map<string, number>();
  const indexInLayer = new Map<string, number>();
  const layerCounts: number[] = [];
  const seen = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: TRIGGER_NODE_ID, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    layer.set(current.id, current.depth);
    const index = layerCounts[current.depth] ?? 0;
    indexInLayer.set(current.id, index);
    layerCounts[current.depth] = index + 1;
    for (const child of childrenOf(definition, current.id)) {
      if (!seen.has(child)) queue.push({ id: child, depth: current.depth + 1 });
    }
  }

  let orphanDepth = Math.max(1, ...layer.values(), 0) + 1;
  for (const step of definition.steps) {
    if (seen.has(step.id)) continue;
    layer.set(step.id, orphanDepth);
    const index = layerCounts[orphanDepth] ?? 0;
    indexInLayer.set(step.id, index);
    layerCounts[orphanDepth] = index + 1;
    if ((layerCounts[orphanDepth] ?? 0) > 6) orphanDepth += 1;
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, depth] of layer) {
    positions[id] = {
      x: ORIGIN_X + depth * COL_W,
      y: ORIGIN_Y + (indexInLayer.get(id) ?? 0) * ROW_H,
    };
  }
  return positions;
}

function resolvePositions(definition: FlowDefinition): Record<string, { x: number; y: number }> {
  return { ...autoLayout(definition), ...definition.canvas?.nodes };
}

function blockIdForStep(headId: string, step: FlowStep, index: number, used: Set<string>): string {
  const prefix = `${headId}:`;
  let id = index === 0 ? "b0" : step.id.startsWith(prefix) ? step.id.slice(prefix.length) : step.id;
  if (!id || used.has(id)) id = `${id || "b"}-${index}`;
  used.add(id);
  return id;
}

/** Build one Send Message node from a head step plus its continuation blocks. */
function messageNodeFromChain(chain: ChainStep[], position: { x: number; y: number }): CanvasNode {
  const head = chain[0]!;
  const used = new Set<string>();
  let buttonIndex = 0;
  const blocks: MessageBlock[] = chain.map((step, index) => {
    const id = blockIdForStep(head.id, step, index, used);
    if (step.type === "delay") return { id, type: "delay", seconds: step.seconds };
    const buttons: CanvasButton[] = (step.buttons ?? []).map((button) => ({
      id: buttonHandleId(buttonIndex++),
      text: button.text,
      ...(button.url ? { url: button.url } : {}),
    }));
    if (step.media) return { id, type: mediaBlockTypeFor(step.media.kind), text: step.text, media: step.media, buttons };
    return { id, type: "text", text: step.text, buttons };
  });
  const last = chain[chain.length - 1]!;
  const quickReplies: CanvasQuickReply[] =
    last.type === "text"
      ? (last.quickReplies ?? []).map((reply, index) => ({ id: quickReplyHandleId(index), text: reply.text }))
      : [];
  return {
    id: head.id,
    type: "send_message",
    position,
    data: { kind: "send_message", blocks, quickReplies },
  };
}

function nodeFromStep(step: FlowStep, position: { x: number; y: number }): CanvasNode {
  if (step.type === "text") {
    return messageNodeFromChain([step], position);
  }
  if (step.type === "capture") {
    return {
      id: step.id,
      type: "capture",
      position,
      data: { kind: "capture", field: step.field, prompt: step.prompt, ...(step.skippable ? { skippable: true } : {}) },
    };
  }
  if (step.type === "tag") {
    return {
      id: step.id,
      type: "tag",
      position,
      data: { kind: "tag", tagName: step.tagName, action: step.action === "remove" ? "remove" : "add" },
    };
  }
  if (step.type === "set_field") {
    return {
      id: step.id,
      type: "set_field",
      position,
      data: { kind: "set_field", field: step.field, value: step.value, ...(step.mode && step.mode !== "set" ? { mode: step.mode } : {}) },
    };
  }
  if (step.type === "subscribe") {
    return {
      id: step.id,
      type: "subscribe",
      position,
      data: {
        kind: "subscribe",
        listName: step.listName,
        action: step.action === "unsubscribe" ? "unsubscribe" : "subscribe",
      },
    };
  }
  if (step.type === "delay") {
    return {
      id: step.id,
      type: "delay",
      position,
      data: {
        kind: "delay",
        seconds: step.seconds,
        unit: step.unit,
        sendAfter: step.sendAfter,
        sendBefore: step.sendBefore,
      },
    };
  }
  if (step.type === "randomizer") {
    return {
      id: step.id,
      type: "randomizer",
      position,
      data: {
        kind: "randomizer",
        sticky: Boolean(step.sticky),
        paths: step.paths.map((path) => ({ id: path.id, percent: path.percent })),
      },
    };
  }
  if (step.type === "condition") {
    return {
      id: step.id,
      type: "condition",
      position,
      data: {
        kind: "condition",
        check: step.check,
        tagName: step.tagName ?? "lead",
        field: step.field ?? "email",
        op: step.op ?? "set",
        value: step.value ?? "",
        ...(step.extra?.length ? { extra: step.extra, match: step.match ?? "all" } : {}),
      },
    };
  }
  if (step.type === "form") {
    return {
      id: step.id,
      type: "form",
      position,
      data: { kind: "form", intro: step.intro ?? "", fields: step.fields },
    };
  }
  if (step.type === "start_flow") {
    return {
      id: step.id,
      type: "start_flow",
      position,
      data: { kind: "start_flow", flowId: step.flowId },
    };
  }
  if (step.type === "http") {
    return {
      id: step.id,
      type: "http",
      position,
      data: {
        kind: "http",
        url: step.url,
        method: step.method === "GET" ? "GET" : "POST",
        body: step.body ?? "",
      },
    };
  }
  if (step.type === "notify") {
    return {
      id: step.id,
      type: "notify",
      position,
      data: { kind: "notify", text: step.text },
    };
  }
  if (step.type === "goal") {
    return {
      id: step.id,
      type: "goal",
      position,
      data: { kind: "goal", name: step.name, value: step.value !== undefined ? String(step.value) : "" },
    };
  }
  if (step.type === "gallery") {
    let buttonIndex = 0;
    return {
      id: step.id,
      type: "gallery",
      position,
      data: {
        kind: "gallery",
        text: step.text ?? "",
        cards: step.cards.map((card, index) => ({
          id: `card-${index}`,
          title: card.title,
          subtitle: card.subtitle ?? "",
          imageUrl: card.imageUrl ?? "",
          url: card.url ?? "",
          buttons: (card.buttons ?? []).map((button) => ({
            id: buttonHandleId(buttonIndex++),
            text: button.text,
            ...(button.url ? { url: button.url } : {}),
          })),
        })),
      },
    };
  }
  if (step.type === "ai") {
    return {
      id: step.id,
      type: "ai",
      position,
      data: { kind: "ai", goal: step.goal, collect: (step.collect ?? []).join(", ") },
    };
  }
  return {
    id: step.id,
    type: "end",
    position,
    data: { kind: "end", text: step.text },
  };
}

function outgoingEdgesForChain(chain: ChainStep[]): CanvasEdge[] {
  const source = chain[0]!.id;
  const edges: CanvasEdge[] = [];
  let buttonIndex = 0;
  for (const step of chain) {
    if (step.type !== "text") continue;
    for (const button of step.buttons ?? []) {
      const handle = buttonHandleId(buttonIndex++);
      if (!button.next) continue;
      edges.push({
        id: edgeId(source, handle, button.next),
        source,
        target: button.next,
        sourceHandle: handle,
        targetHandle: "in",
      });
    }
  }
  const last = chain[chain.length - 1]!;
  if (last.type === "text") {
    (last.quickReplies ?? []).forEach((reply, index) => {
      if (!reply.next) return;
      const handle = quickReplyHandleId(index);
      edges.push({
        id: edgeId(source, handle, reply.next),
        source,
        target: reply.next,
        sourceHandle: handle,
        targetHandle: "in",
      });
    });
  }
  if (last.next) {
    edges.push({
      id: edgeId(source, "next", last.next),
      source,
      target: last.next,
      sourceHandle: "next",
      targetHandle: "in",
    });
  }
  return edges;
}

function outgoingEdgesForStep(step: FlowStep): CanvasEdge[] {
  if (step.type === "text") {
    return outgoingEdgesForChain([step]);
  }
  if (step.type === "gallery") {
    const edges: CanvasEdge[] = [];
    stepButtons(step).forEach((button, index) => {
      if (!button.next) return;
      const handle = buttonHandleId(index);
      edges.push({ id: edgeId(step.id, handle, button.next), source: step.id, target: button.next, sourceHandle: handle, targetHandle: "in" });
    });
    if (step.next) edges.push({ id: edgeId(step.id, "next", step.next), source: step.id, target: step.next, sourceHandle: "next", targetHandle: "in" });
    return edges;
  }
  if (step.type === "randomizer") {
    return step.paths.flatMap((path) => {
      if (!path.next) return [];
      return [
        {
          id: edgeId(step.id, path.id, path.next),
          source: step.id,
          target: path.next,
          sourceHandle: path.id,
          targetHandle: "in",
        },
      ];
    });
  }
  if (step.type === "condition") {
    return [
      step.nextTrue
        ? {
            id: edgeId(step.id, "yes", step.nextTrue),
            source: step.id,
            target: step.nextTrue,
            sourceHandle: "yes",
            targetHandle: "in",
          }
        : null,
      step.nextFalse
        ? {
            id: edgeId(step.id, "no", step.nextFalse),
            source: step.id,
            target: step.nextFalse,
            sourceHandle: "no",
            targetHandle: "in",
          }
        : null,
    ].filter((edge): edge is CanvasEdge => Boolean(edge));
  }
  if (step.type === "end") return [];
  const next = "next" in step ? step.next : undefined;
  if (!next) return [];
  return [
    {
      id: edgeId(step.id, "next", next),
      source: step.id,
      target: next,
      sourceHandle: "next",
      targetHandle: "in",
    },
  ];
}

export function definitionToCanvas(definition: FlowDefinition): CanvasGraph {
  const positions = resolvePositions(definition);
  const folded = continuationStepIds(definition);
  const heads = definition.steps.filter((step) => !folded.has(step.id));
  const chains = new Map<string, ChainStep[]>();
  for (const step of heads) {
    if (isChainStep(step) && step.group === step.id) chains.set(step.id, collectChain(definition, step));
  }
  const nodes: CanvasNode[] = [
    {
      id: TRIGGER_NODE_ID,
      type: "trigger",
      position: positions[TRIGGER_NODE_ID] ?? { x: ORIGIN_X, y: ORIGIN_Y },
      data: { kind: "trigger" },
    },
    ...heads.map((step) => {
      const position = positions[step.id] ?? { x: ORIGIN_X, y: ORIGIN_Y };
      const chain = chains.get(step.id);
      return chain ? messageNodeFromChain(chain, position) : nodeFromStep(step, position);
    }),
  ];

  const edges: CanvasEdge[] = [];
  if (definition.startStepId) {
    edges.push({
      id: edgeId(TRIGGER_NODE_ID, "out", definition.startStepId),
      source: TRIGGER_NODE_ID,
      target: definition.startStepId,
      sourceHandle: "out",
      targetHandle: "in",
    });
  }
  for (const step of heads) {
    const chain = chains.get(step.id);
    edges.push(...(chain ? outgoingEdgesForChain(chain) : outgoingEdgesForStep(step)));
  }

  return { nodes, edges };
}

function nextFromHandle(edges: CanvasEdge[], source: string, sourceHandle: string): string | undefined {
  return edges.find((edge) => edge.source === source && edge.sourceHandle === sourceHandle)?.target;
}

function compileButtons(nodeId: string, buttons: CanvasButton[], edges: CanvasEdge[]) {
  return buttons.map((button) => ({
    text: button.text,
    ...(button.url ? { url: button.url } : { next: nextFromHandle(edges, nodeId, button.id) ?? "" }),
  }));
}

/**
 * A Send Message node becomes a chain of engine steps: the first keeps the node id so incoming
 * edges resolve, later blocks are `${nodeId}:${blockId}` linked by `next` and tagged with `group`.
 */
export function blockLabel(type: MessageBlock["type"]): string {
  if (type === "text") return "Text";
  if (type === "image") return "Image / GIF";
  if (type === "video") return "Video";
  if (type === "audio") return "Audio";
  if (type === "file") return "File";
  return "Typing delay";
}

export function compileSendMessage(nodeId: string, data: SendMessageData, edges: CanvasEdge[]): FlowStep[] {
  const blocks: MessageBlock[] =
    data.blocks.length > 0 ? data.blocks : [{ id: "b0", type: "text", text: "", buttons: [] }];
  const nodeNext = nextFromHandle(edges, nodeId, "next");
  const grouped = blocks.length > 1;
  const stepIdFor = (index: number) => (index === 0 ? nodeId : `${nodeId}:${blocks[index]!.id}`);
  const quickReplies = data.quickReplies
    .filter((reply) => reply.text.trim())
    .map((reply) => ({ text: reply.text, next: nextFromHandle(edges, nodeId, reply.id) ?? "" }));

  return blocks.map((block, index): FlowStep => {
    const isLast = index === blocks.length - 1;
    const next = isLast ? nodeNext : stepIdFor(index + 1);
    const group = grouped ? { group: nodeId } : {};
    if (block.type === "delay") {
      return {
        id: stepIdFor(index),
        type: "delay",
        seconds: Math.max(0, Math.min(MAX_TYPING_DELAY_SECONDS, Math.floor(block.seconds || 0))),
        ...group,
        next: next ?? "",
      };
    }
    return {
      id: stepIdFor(index),
      type: "text",
      text: block.text,
      ...(isMediaBlock(block) && block.media ? { media: block.media } : {}),
      ...(block.buttons.length > 0 ? { buttons: compileButtons(nodeId, block.buttons, edges) } : {}),
      ...(isLast && quickReplies.length > 0 ? { quickReplies } : {}),
      ...group,
      ...(next ? { next } : {}),
    };
  });
}

const OP_LABEL: Record<ConditionOp, string> = {
  eq: "=",
  neq: "≠",
  contains: "contains",
  not_contains: "doesn't contain",
  set: "is set",
  not_set: "is empty",
  gt: ">",
  lt: "<",
};

/** One-line summary of a condition rule for node previews. */
export function ruleSummary(rule: ConditionRule): string {
  const negate = rule.op === "not_set";
  const name = (rule.tagName ?? "").trim();
  if (rule.check === "tag") return name ? `${negate ? "No" : "Has"} #${name}` : "Has a tag";
  if (rule.check === "subscription") {
    if (!name || name.toLowerCase() === "all") return negate ? "Opted out" : "Subscribed (not opted out)";
    return `${negate ? "Not subscribed" : "Subscribed"} to “${name}”`;
  }
  const field = (rule.field ?? "email").replace(/^custom:/, "");
  const op = rule.op ?? "set";
  return `${field} ${OP_LABEL[op]}${op !== "set" && op !== "not_set" && rule.value ? ` “${rule.value}”` : ""}`;
}

/** Keep only the parts of a condition rule its check uses. */
export function cleanRule(rule: ConditionRule): ConditionRule {
  if (rule.check === "field") {
    const op = rule.op ?? "set";
    return { check: "field", field: rule.field ?? "email", op, ...(op !== "set" && op !== "not_set" && rule.value ? { value: rule.value } : {}) };
  }
  return { check: rule.check, tagName: rule.tagName ?? "", ...(rule.op === "not_set" ? { op: "not_set" as const } : {}) };
}

export function canvasToDefinition(graph: CanvasGraph): FlowDefinition {
  const startStepId = nextFromHandle(graph.edges, TRIGGER_NODE_ID, "out") ?? "";
  const steps: FlowStep[] = [];
  const canvas: FlowCanvasLayout = { nodes: {} };

  for (const node of graph.nodes) {
    canvas.nodes[node.id] = { x: node.position.x, y: node.position.y };
    if (node.id === TRIGGER_NODE_ID) continue;

    if (node.data.kind === "send_message") {
      steps.push(...compileSendMessage(node.id, node.data, graph.edges));
      continue;
    }

    if (node.data.kind === "gallery") {
      const next = nextFromHandle(graph.edges, node.id, "next");
      steps.push({
        id: node.id,
        type: "gallery",
        ...(node.data.text.trim() ? { text: node.data.text } : {}),
        cards: node.data.cards.map((card) => ({
          title: card.title,
          ...(card.subtitle.trim() ? { subtitle: card.subtitle } : {}),
          ...(card.imageUrl.trim() ? { imageUrl: card.imageUrl.trim() } : {}),
          ...(card.url.trim() ? { url: card.url.trim() } : {}),
          ...(card.buttons.length
            ? { buttons: card.buttons.map((button) => (button.url ? { text: button.text, url: button.url } : { text: button.text, next: nextFromHandle(graph.edges, node.id, button.id) ?? "" })) }
            : {}),
        })),
        ...(next ? { next } : {}),
      });
      continue;
    }

    if (node.data.kind === "message" || node.data.kind === "media") {
      const next = nextFromHandle(graph.edges, node.id, "next");
      steps.push({
        id: node.id,
        type: "text",
        text: node.data.text,
        ...(node.data.media ? { media: node.data.media } : {}),
        ...(next ? { next } : {}),
      });
      continue;
    }

    if (node.data.kind === "buttons") {
      steps.push({
        id: node.id,
        type: "text",
        text: node.data.text,
        ...(node.data.media ? { media: node.data.media } : {}),
        buttons: node.data.buttons.map((button) => ({
          text: button.text,
          ...(button.url ? { url: button.url } : { next: nextFromHandle(graph.edges, node.id, button.id) ?? "" }),
        })),
      });
      continue;
    }

    if (node.data.kind === "capture") {
      steps.push({
        id: node.id,
        type: "capture",
        field: node.data.field,
        prompt: node.data.prompt,
        ...(node.data.skippable ? { skippable: true } : {}),
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "form") {
      steps.push({
        id: node.id,
        type: "form",
        intro: node.data.intro || undefined,
        fields: node.data.fields,
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "tag") {
      steps.push({
        id: node.id,
        type: "tag",
        tagName: node.data.tagName,
        action: node.data.action,
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "set_field") {
      steps.push({
        id: node.id,
        type: "set_field",
        field: node.data.field,
        value: node.data.value,
        ...(node.data.mode && node.data.mode !== "set" ? { mode: node.data.mode } : {}),
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "subscribe") {
      steps.push({
        id: node.id,
        type: "subscribe",
        listName: node.data.listName,
        action: node.data.action,
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "delay") {
      steps.push({
        id: node.id,
        type: "delay",
        seconds: node.data.seconds,
        ...(node.data.unit ? { unit: node.data.unit } : {}),
        ...(node.data.sendAfter ? { sendAfter: node.data.sendAfter } : {}),
        ...(node.data.sendBefore ? { sendBefore: node.data.sendBefore } : {}),
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "randomizer") {
      steps.push({
        id: node.id,
        type: "randomizer",
        sticky: node.data.sticky,
        paths: node.data.paths.map((path) => ({
          id: path.id,
          percent: path.percent,
          next: nextFromHandle(graph.edges, node.id, path.id) ?? "",
        })),
      });
      continue;
    }

    if (node.data.kind === "condition") {
      steps.push({
        id: node.id,
        type: "condition",
        check: node.data.check,
        ...(node.data.check === "tag" || node.data.check === "subscription"
          ? { tagName: node.data.tagName, ...(node.data.op === "not_set" ? { op: "not_set" as const } : {}) }
          : {}),
        ...(node.data.check === "field"
          ? {
              field: node.data.field,
              op: node.data.op,
              ...(node.data.op !== "set" && node.data.value ? { value: node.data.value } : {}),
            }
          : {}),
        ...(node.data.extra?.length ? { extra: node.data.extra.map(cleanRule), match: node.data.match ?? "all" } : {}),
        nextTrue: nextFromHandle(graph.edges, node.id, "yes") ?? "",
        nextFalse: nextFromHandle(graph.edges, node.id, "no") ?? "",
      });
      continue;
    }

    if (node.data.kind === "start_flow") {
      steps.push({
        id: node.id,
        type: "start_flow",
        flowId: node.data.flowId,
        next: nextFromHandle(graph.edges, node.id, "next"),
      });
      continue;
    }

    if (node.data.kind === "http") {
      steps.push({
        id: node.id,
        type: "http",
        url: node.data.url,
        method: node.data.method,
        ...(node.data.body.trim() ? { body: node.data.body } : {}),
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "notify") {
      steps.push({
        id: node.id,
        type: "notify",
        text: node.data.text,
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "goal") {
      const next = nextFromHandle(graph.edges, node.id, "next");
      const value = Number(node.data.value);
      steps.push({
        id: node.id,
        type: "goal",
        name: node.data.name,
        ...(node.data.value.trim() && Number.isFinite(value) ? { value } : {}),
        ...(next ? { next } : {}),
      });
      continue;
    }

    if (node.data.kind === "ai") {
      const next = nextFromHandle(graph.edges, node.id, "next");
      const collect = parseCollectList(node.data.collect);
      steps.push({
        id: node.id,
        type: "ai",
        goal: node.data.goal,
        ...(collect.length ? { collect } : {}),
        ...(next ? { next } : {}),
      });
      continue;
    }

    if (node.data.kind === "end") {
      steps.push({
        id: node.id,
        type: "end",
        ...(node.data.text ? { text: node.data.text } : {}),
      });
    }
  }

  return { startStepId, steps, canvas };
}

/** Engine-facing payload: drop layout so Telegram steps stay unchanged. */
export function engineDefinition(definition: FlowDefinition): FlowDefinition {
  return {
    startStepId: definition.startStepId,
    steps: definition.steps.map((step) => {
      if (step.type === "text") {
        return {
          id: step.id,
          type: "text",
          text: step.text,
          ...(step.media
            ? {
                media: {
                  url: step.media.url,
                  kind: step.media.kind,
                  ...(step.media.mime ? { mime: step.media.mime } : {}),
                  ...(step.media.filename ? { filename: step.media.filename } : {}),
                  ...(step.media.id ? { id: step.media.id } : {}),
                },
              }
            : {}),
          ...(step.next ? { next: step.next } : {}),
          ...(step.buttons
            ? {
                buttons: step.buttons.map((button) => ({
                  text: button.text,
                  ...(button.url ? { url: button.url } : { next: button.next ?? "" }),
                })),
              }
            : {}),
          ...(step.quickReplies && step.quickReplies.length > 0
            ? { quickReplies: step.quickReplies.map((reply) => ({ text: reply.text, next: reply.next ?? "" })) }
            : {}),
          ...(step.group ? { group: step.group } : {}),
        };
      }
      if (step.type === "capture") {
        return {
          id: step.id,
          type: "capture",
          field: step.field,
          prompt: step.prompt,
          ...(step.skippable ? { skippable: true as const } : {}),
          next: step.next,
        };
      }
      if (step.type === "form") {
        return {
          id: step.id,
          type: "form",
          ...(step.intro ? { intro: step.intro } : {}),
          fields: step.fields,
          next: step.next,
        };
      }
      if (step.type === "tag") {
        return {
          id: step.id,
          type: "tag",
          tagName: step.tagName,
          ...(step.action === "remove" ? { action: "remove" as const } : {}),
          next: step.next,
        };
      }
      if (step.type === "set_field") {
        return {
          id: step.id,
          type: "set_field",
          field: step.field,
          value: step.value,
          ...(step.mode && step.mode !== "set" ? { mode: step.mode } : {}),
          next: step.next,
        };
      }
      if (step.type === "subscribe") {
        return {
          id: step.id,
          type: "subscribe",
          listName: step.listName,
          action: step.action === "unsubscribe" ? "unsubscribe" : "subscribe",
          next: step.next,
        };
      }
      if (step.type === "delay") {
        return {
          id: step.id,
          type: "delay",
          seconds: step.seconds,
          ...(step.unit ? { unit: step.unit } : {}),
          ...(step.sendAfter ? { sendAfter: step.sendAfter } : {}),
          ...(step.sendBefore ? { sendBefore: step.sendBefore } : {}),
          ...(step.group ? { group: step.group } : {}),
          next: step.next,
        };
      }
      if (step.type === "randomizer") {
        return {
          id: step.id,
          type: "randomizer",
          ...(step.sticky ? { sticky: true as const } : {}),
          paths: step.paths.map((path) => ({
            id: path.id,
            percent: path.percent,
            ...(path.next ? { next: path.next } : {}),
          })),
        };
      }
      if (step.type === "condition") {
        return {
          id: step.id,
          type: "condition",
          check: step.check,
          ...((step.check === "tag" || step.check === "subscription") && step.tagName
            ? { tagName: step.tagName }
            : {}),
          ...(step.check === "field" && step.field ? { field: step.field } : {}),
          ...(step.check === "field" && step.op ? { op: step.op } : {}),
          ...(step.check !== "field" && step.op === "not_set" ? { op: step.op } : {}),
          ...(step.check === "field" && step.op !== "set" && step.op !== "not_set" && step.value ? { value: step.value } : {}),
          ...(step.extra?.length ? { extra: step.extra.map(cleanRule), match: step.match ?? "all" } : {}),
          nextTrue: step.nextTrue,
          nextFalse: step.nextFalse,
        };
      }
      if (step.type === "start_flow") {
        return {
          id: step.id,
          type: "start_flow",
          flowId: step.flowId,
          ...(step.next ? { next: step.next } : {}),
        };
      }
      if (step.type === "http") {
        return {
          id: step.id,
          type: "http",
          url: step.url,
          method: step.method === "GET" ? "GET" : "POST",
          ...(step.body?.trim() ? { body: step.body } : {}),
          next: step.next,
        };
      }
      if (step.type === "notify") {
        return { id: step.id, type: "notify", text: step.text, next: step.next };
      }
      if (step.type === "goal") {
        return {
          id: step.id,
          type: "goal",
          name: step.name,
          ...(typeof step.value === "number" ? { value: step.value } : {}),
          ...(step.next ? { next: step.next } : {}),
        };
      }
      if (step.type === "gallery") {
        return { id: step.id, type: "gallery", ...(step.text ? { text: step.text } : {}), cards: step.cards, ...(step.next ? { next: step.next } : {}) };
      }
      if (step.type === "ai") {
        return {
          id: step.id,
          type: "ai",
          goal: step.goal,
          ...(step.collect?.length ? { collect: step.collect } : {}),
          ...(step.next ? { next: step.next } : {}),
        };
      }
      return { id: step.id, type: "end", ...(step.text ? { text: step.text } : {}) };
    }),
  };
}

/** "email, phone, budget" → field keys the AI step may fill. Custom keys are snake_cased. */
export function parseCollectList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]+/)
        .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""))
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

export function createCanvasNode(
  kind: Exclude<CanvasNodeKind, "trigger">,
  position: { x: number; y: number },
  id = newStepId(),
): CanvasNode {
  switch (kind) {
    case "send_message":
      return {
        id,
        type: "send_message",
        position,
        data: {
          kind: "send_message",
          blocks: [{ id: newBlockId(), type: "text", text: "Hello.", buttons: [] }],
          quickReplies: [],
        },
      };
    case "gallery":
      return {
        id,
        type: "gallery",
        position,
        data: {
          kind: "gallery",
          text: "",
          cards: [
            { id: "card-0", title: "Starter", subtitle: "$29 · for getting going", imageUrl: "", url: "", buttons: [{ id: buttonHandleId(0), text: "Choose Starter" }] },
            { id: "card-1", title: "Pro", subtitle: "$79 · for growing teams", imageUrl: "", url: "", buttons: [{ id: buttonHandleId(1), text: "Choose Pro" }] },
          ],
        },
      };
    case "message":
      return { id, type: "message", position, data: { kind: "message", text: "Hello." } };
    case "media":
      return { id, type: "media", position, data: { kind: "media", text: "" } };
    case "buttons":
      return {
        id,
        type: "buttons",
        position,
        data: {
          kind: "buttons",
          text: "Choose an option:",
          buttons: [
            { id: buttonHandleId(0), text: "Option A" },
            { id: buttonHandleId(1), text: "Option B" },
          ],
        },
      };
    case "capture":
      return {
        id,
        type: "capture",
        position,
        data: { kind: "capture", field: "name", prompt: "What's your name?" },
      };
    case "form":
      return {
        id,
        type: "form",
        position,
        data: {
          kind: "form",
          intro: "A few quick details:",
          fields: [
            { field: "name", prompt: "What's your name?" },
            { field: "email", prompt: "What's the best email?" },
            { field: "phone", prompt: "And a phone number?" },
          ],
        },
      };
    case "tag":
      return { id, type: "tag", position, data: { kind: "tag", tagName: "lead", action: "add" } };
    case "set_field":
      return {
        id,
        type: "set_field",
        position,
        data: { kind: "set_field", field: "custom:source", value: "flow" },
      };
    case "subscribe":
      return {
        id,
        type: "subscribe",
        position,
        data: { kind: "subscribe", listName: "newsletter", action: "subscribe" },
      };
    case "delay":
      return { id, type: "delay", position, data: { kind: "delay", seconds: 300, unit: "seconds" } };
    case "randomizer":
      return {
        id,
        type: "randomizer",
        position,
        data: {
          kind: "randomizer",
          sticky: true,
          paths: [
            { id: "path-a", percent: 50 },
            { id: "path-b", percent: 50 },
          ],
        },
      };
    case "condition":
      return {
        id,
        type: "condition",
        position,
        data: { kind: "condition", check: "tag", tagName: "lead", field: "email", op: "set", value: "" },
      };
    case "start_flow":
      return { id, type: "start_flow", position, data: { kind: "start_flow", flowId: "" } };
    case "http":
      return {
        id,
        type: "http",
        position,
        data: { kind: "http", url: "https://", method: "POST", body: "" },
      };
    case "notify":
      return {
        id,
        type: "notify",
        position,
        data: { kind: "notify", text: "New lead: {{name}} {{email}}" },
      };
    case "goal":
      return { id, type: "goal", position, data: { kind: "goal", name: "Booked a call", value: "" } };
    case "ai":
      return {
        id,
        type: "ai",
        position,
        data: { kind: "ai", goal: "Answer their questions and find out what they need", collect: "email" },
      };
    case "end":
      return { id, type: "end", position, data: { kind: "end", text: "Done." } };
  }
}

export function replaceHandleEdge(
  edges: CanvasEdge[],
  incoming: { source: string; target: string; sourceHandle: string; targetHandle?: string },
): CanvasEdge[] {
  const sourceHandle = incoming.sourceHandle;
  const targetHandle = incoming.targetHandle ?? "in";
  return [
    ...edges.filter((edge) => !(edge.source === incoming.source && edge.sourceHandle === sourceHandle)),
    {
      id: edgeId(incoming.source, sourceHandle, incoming.target),
      source: incoming.source,
      target: incoming.target,
      sourceHandle,
      targetHandle,
    },
  ];
}

export function isValidCanvasConnection(connection: {
  source?: string | null;
  target?: string | null;
}): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  if (connection.target === TRIGGER_NODE_ID) return false;
  return true;
}

export type CanvasValidation = {
  errors: string[];
  warnings: string[];
};

export type ChannelLimits = {
  label: string;
  maxButtons: number;
  maxQuickReplies: number;
  supportsCommands: boolean;
  supportsPhoneShare: boolean;
};

export function validateCanvas(graph: CanvasGraph, channel?: ChannelLimits): CanvasValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stepIds = new Set(graph.nodes.filter((node) => node.id !== TRIGGER_NODE_ID).map((node) => node.id));

  const triggerOut = graph.edges.filter((edge) => edge.source === TRIGGER_NODE_ID);
  if (triggerOut.length === 0) errors.push("Connect the trigger to the first step.");
  if (triggerOut.length > 1) errors.push("Trigger can only start one step.");

  if (triggerOut[0] && !stepIds.has(triggerOut[0].target)) {
    errors.push("Trigger points at a missing step.");
  }

  for (const node of graph.nodes) {
    if (node.data.kind === "send_message") {
      if (node.data.blocks.length === 0) warnings.push("A Send Message step has no content blocks.");
      for (const block of node.data.blocks) {
        if (block.type === "text" && !block.text.trim()) warnings.push("A text block is empty.");
        if (isMediaBlock(block) && !block.media?.url) warnings.push(`${blockLabel(block.type)} block has no file yet.`);
        if (block.type === "delay" && block.seconds > MAX_TYPING_DELAY_SECONDS) {
          warnings.push(`A typing delay is capped at ${MAX_TYPING_DELAY_SECONDS}s; use Smart Delay for longer waits.`);
        }
        if (block.type === "delay") continue;
        for (const button of block.buttons) {
          if (!button.text.trim()) warnings.push("A button is missing a label.");
          if (button.url) {
            if (!/^https:\/\//i.test(button.url)) {
              warnings.push(`Button “${button.text || "untitled"}” URL should start with https://`);
            }
            continue;
          }
          const dest = nextFromHandle(graph.edges, node.id, button.id);
          if (!dest) warnings.push(`Button “${button.text || "untitled"}” is not connected.`);
          else if (!stepIds.has(dest)) errors.push(`Button “${button.text}” points at a missing step.`);
        }
      }
      if (channel) {
        for (const block of node.data.blocks) {
          if (block.type !== "delay" && block.buttons.length > channel.maxButtons) {
            warnings.push(`${channel.label} shows at most ${channel.maxButtons} buttons per message; extras are sent as text.`);
            break;
          }
        }
        if (node.data.quickReplies.length > channel.maxQuickReplies) {
          warnings.push(`${channel.label} allows at most ${channel.maxQuickReplies} quick replies.`);
        }
      }
      const last = node.data.blocks[node.data.blocks.length - 1];
      if (node.data.quickReplies.length > 0 && last?.type === "delay") {
        warnings.push("Quick replies need a text or image block as the last block.");
      }
      if (node.data.quickReplies.length > 0 && nextFromHandle(graph.edges, node.id, "next")) {
        warnings.push("Quick replies wait for a tap, so the Next step connector on that message is not used.");
      }
      for (const reply of node.data.quickReplies) {
        if (!reply.text.trim()) warnings.push("A quick reply is missing a label.");
        const dest = nextFromHandle(graph.edges, node.id, reply.id);
        if (!dest) warnings.push(`Quick reply “${reply.text || "untitled"}” is not connected.`);
        else if (!stepIds.has(dest)) errors.push(`Quick reply “${reply.text}” points at a missing step.`);
      }
    }
    if (node.data.kind === "gallery") {
      if (node.data.cards.length === 0) warnings.push("A gallery has no cards.");
      for (const card of node.data.cards) {
        if (!card.title.trim()) warnings.push("A gallery card is missing a title.");
        if (card.buttons.length > 3) warnings.push(`Card “${card.title || "untitled"}” has more than 3 buttons; extras are dropped.`);
        for (const button of card.buttons) {
          if (!button.text.trim()) warnings.push("A card button is missing a label.");
          if (button.url) continue;
          const dest = nextFromHandle(graph.edges, node.id, button.id);
          if (!dest) warnings.push(`Card button “${button.text || "untitled"}” is not connected.`);
          else if (!stepIds.has(dest)) errors.push(`Card button “${button.text}” points at a missing step.`);
        }
      }
    }
    if (node.data.kind === "buttons") {
      if (node.data.buttons.length === 0) {
        warnings.push("A buttons step has no choices.");
      }
      for (const button of node.data.buttons) {
        if (!button.text.trim()) warnings.push("A button is missing a label.");
        if (button.url) {
          if (!/^https:\/\//i.test(button.url)) {
            warnings.push(`Button “${button.text || "untitled"}” URL should start with https://`);
          }
          continue;
        }
        const dest = nextFromHandle(graph.edges, node.id, button.id);
        if (!dest) warnings.push(`Button “${button.text || "untitled"}” is not connected.`);
        else if (!stepIds.has(dest)) errors.push(`Button “${button.text}” points at a missing step.`);
      }
    }
    if (node.data.kind === "message" && !node.data.text.trim() && !node.data.media) {
      warnings.push("A message step is empty.");
    }
    if (node.data.kind === "media" && !node.data.media?.url) {
      warnings.push("An image/GIF step has no media yet.");
    }
    if (node.data.kind === "capture") {
      if (!node.data.prompt.trim()) warnings.push("A capture step has no prompt.");
      const dest = nextFromHandle(graph.edges, node.id, "next");
      if (!dest) warnings.push("A capture step has no next step.");
    }
    if (node.data.kind === "tag") {
      if (!node.data.tagName.trim()) errors.push("A tag step is missing a tag name.");
      const dest = nextFromHandle(graph.edges, node.id, "next");
      if (!dest) warnings.push("A tag step has no next step.");
    }
    if (node.data.kind === "set_field") {
      if (node.data.field.startsWith("custom:") && !node.data.field.slice("custom:".length).trim()) {
        errors.push("A set-field step is missing a custom field key.");
      }
      const dest = nextFromHandle(graph.edges, node.id, "next");
      if (!dest) warnings.push("A set-field step has no next step.");
    }
    if (node.data.kind === "subscribe") {
      if (node.data.action === "subscribe" && !node.data.listName.trim()) {
        errors.push("A subscribe step is missing a list name.");
      }
    }
    if (node.data.kind === "form" && node.data.fields.length === 0) {
      warnings.push("A lead form has no fields.");
    }
    if (node.data.kind === "condition") {
      if ((node.data.check === "tag" || node.data.check === "subscription") && !node.data.tagName.trim()) {
        errors.push("A condition is missing a tag or list name.");
      }
      if (!nextFromHandle(graph.edges, node.id, "yes") || !nextFromHandle(graph.edges, node.id, "no")) {
        warnings.push("A condition is missing a Yes or No branch.");
      }
    }
    if (node.data.kind === "delay" && node.data.seconds < 0) {
      errors.push("A delay cannot be negative.");
    }
    if (node.data.kind === "randomizer") {
      if (node.data.paths.length < 2) warnings.push("A randomizer needs at least two paths.");
      const total = node.data.paths.reduce((sum, path) => sum + path.percent, 0);
      if (total !== 100) warnings.push("Randomizer percentages should add up to 100.");
      for (const path of node.data.paths) {
        if (!nextFromHandle(graph.edges, node.id, path.id)) {
          warnings.push("A randomizer path is not connected.");
        }
      }
    }
    if (node.data.kind === "start_flow" && !node.data.flowId.trim()) {
      warnings.push("A Start flow step has no target flow.");
    }
    if (node.data.kind === "http") {
      if (!/^https:\/\//i.test(node.data.url.trim())) {
        warnings.push("An HTTP step URL should start with https://");
      }
    }
    if (node.data.kind === "notify" && !node.data.text.trim()) {
      warnings.push("A Notify admin step has no message.");
    }
    if (node.data.kind === "goal" && !node.data.name.trim()) {
      warnings.push("A Goal step has no name.");
    }
    if (node.data.kind === "goal" && node.data.value.trim() && !Number.isFinite(Number(node.data.value))) {
      errors.push("A Goal value must be a number.");
    }
    if (node.data.kind === "ai" && !node.data.goal.trim()) {
      errors.push("An AI step needs a goal.");
    }
  }

  return { errors, warnings };
}

export function comparableDefinition(definition: FlowDefinition): {
  startStepId: string;
  steps: Record<string, unknown>;
} {
  const clean = engineDefinition(definition);
  return {
    startStepId: clean.startStepId,
    steps: Object.fromEntries(clean.steps.map((step) => [step.id, step])),
  };
}
