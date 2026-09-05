import type {
  CaptureField,
  FlowCanvasLayout,
  FlowDefinition,
  FlowMedia,
  FlowStep,
} from "@/lib/types";

export const TRIGGER_NODE_ID = "__trigger";

export type CanvasNodeKind = "trigger" | "message" | "media" | "buttons" | "capture" | "tag" | "end";

export type CanvasButton = {
  id: string;
  text: string;
};

export type CanvasNodeData =
  | { kind: "trigger" }
  | { kind: "message"; text: string; media?: FlowMedia }
  | { kind: "media"; text: string; media?: FlowMedia }
  | { kind: "buttons"; text: string; buttons: CanvasButton[]; media?: FlowMedia }
  | { kind: "capture"; field: CaptureField; prompt: string }
  | { kind: "tag"; tagName: string }
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

export function edgeId(source: string, sourceHandle: string, target: string): string {
  return `e:${source}:${sourceHandle}->${target}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function childrenOf(definition: FlowDefinition, id: string): string[] {
  if (id === TRIGGER_NODE_ID) return definition.startStepId ? [definition.startStepId] : [];
  const step = definition.steps.find((item) => item.id === id);
  if (!step) return [];
  if (step.type === "end") return [];
  if (step.type === "text") {
    if (step.buttons && step.buttons.length > 0) {
      return unique(step.buttons.map((button) => button.next));
    }
    return step.next ? [step.next] : [];
  }
  return step.next ? [step.next] : [];
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

function nodeFromStep(step: FlowStep, position: { x: number; y: number }): CanvasNode {
  if (step.type === "text" && step.buttons && step.buttons.length > 0) {
    return {
      id: step.id,
      type: "buttons",
      position,
      data: {
        kind: "buttons",
        text: step.text,
        media: step.media,
        buttons: step.buttons.map((button, index) => ({
          id: buttonHandleId(index),
          text: button.text,
        })),
      },
    };
  }
  if (step.type === "text" && step.media) {
    return {
      id: step.id,
      type: "media",
      position,
      data: { kind: "media", text: step.text, media: step.media },
    };
  }
  if (step.type === "text") {
    return {
      id: step.id,
      type: "message",
      position,
      data: { kind: "message", text: step.text, media: step.media },
    };
  }
  if (step.type === "capture") {
    return {
      id: step.id,
      type: "capture",
      position,
      data: { kind: "capture", field: step.field, prompt: step.prompt },
    };
  }
  if (step.type === "tag") {
    return {
      id: step.id,
      type: "tag",
      position,
      data: { kind: "tag", tagName: step.tagName },
    };
  }
  return {
    id: step.id,
    type: "end",
    position,
    data: { kind: "end", text: step.text },
  };
}

function outgoingEdgesForStep(step: FlowStep): CanvasEdge[] {
  if (step.type === "text" && step.buttons && step.buttons.length > 0) {
    return step.buttons.flatMap((button, index) => {
      if (!button.next) return [];
      const handle = buttonHandleId(index);
      return [
        {
          id: edgeId(step.id, handle, button.next),
          source: step.id,
          target: button.next,
          sourceHandle: handle,
          targetHandle: "in",
        },
      ];
    });
  }
  if (step.type === "end") return [];
  const next = step.type === "text" ? step.next : step.next;
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
  const nodes: CanvasNode[] = [
    {
      id: TRIGGER_NODE_ID,
      type: "trigger",
      position: positions[TRIGGER_NODE_ID] ?? { x: ORIGIN_X, y: ORIGIN_Y },
      data: { kind: "trigger" },
    },
    ...definition.steps.map((step) =>
      nodeFromStep(step, positions[step.id] ?? { x: ORIGIN_X, y: ORIGIN_Y }),
    ),
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
  for (const step of definition.steps) {
    edges.push(...outgoingEdgesForStep(step));
  }

  return { nodes, edges };
}

function nextFromHandle(edges: CanvasEdge[], source: string, sourceHandle: string): string | undefined {
  return edges.find((edge) => edge.source === source && edge.sourceHandle === sourceHandle)?.target;
}

export function canvasToDefinition(graph: CanvasGraph): FlowDefinition {
  const startStepId = nextFromHandle(graph.edges, TRIGGER_NODE_ID, "out") ?? "";
  const steps: FlowStep[] = [];
  const canvas: FlowCanvasLayout = { nodes: {} };

  for (const node of graph.nodes) {
    canvas.nodes[node.id] = { x: node.position.x, y: node.position.y };
    if (node.id === TRIGGER_NODE_ID) continue;

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
          next: nextFromHandle(graph.edges, node.id, button.id) ?? "",
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
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
      });
      continue;
    }

    if (node.data.kind === "tag") {
      steps.push({
        id: node.id,
        type: "tag",
        tagName: node.data.tagName,
        next: nextFromHandle(graph.edges, node.id, "next") ?? "",
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
            ? { buttons: step.buttons.map((button) => ({ text: button.text, next: button.next })) }
            : {}),
        };
      }
      if (step.type === "capture") {
        return { id: step.id, type: "capture", field: step.field, prompt: step.prompt, next: step.next };
      }
      if (step.type === "tag") {
        return { id: step.id, type: "tag", tagName: step.tagName, next: step.next };
      }
      return { id: step.id, type: "end", ...(step.text ? { text: step.text } : {}) };
    }),
  };
}

export function createCanvasNode(
  kind: Exclude<CanvasNodeKind, "trigger">,
  position: { x: number; y: number },
  id = newStepId(),
): CanvasNode {
  switch (kind) {
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
    case "tag":
      return { id, type: "tag", position, data: { kind: "tag", tagName: "lead" } };
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

export function validateCanvas(graph: CanvasGraph): CanvasValidation {
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
    if (node.data.kind === "buttons") {
      if (node.data.buttons.length === 0) {
        warnings.push("A buttons step has no choices.");
      }
      for (const button of node.data.buttons) {
        if (!button.text.trim()) warnings.push("A button is missing a label.");
        const dest = nextFromHandle(graph.edges, node.id, button.id);
        if (!dest) warnings.push(`Button \u201c${button.text || "untitled"}\u201d is not connected.`);
        else if (!stepIds.has(dest)) errors.push(`Button \u201c${button.text}\u201d points at a missing step.`);
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
