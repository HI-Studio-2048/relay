import type { CanvasNodeKind } from "@/lib/flow-canvas";

/** ManyChat Flow Builder tokens — starting step, content, user input, action, stop. */
export const MANYCHAT = {
  start: "#00C853",
  content: "#0084FF",
  input: "#00C2CB",
  action: "#7B61FF",
  stop: "#8B95A1",
  canvas: "#F4F6F8",
  card: "#FFFFFF",
  ink: "#1B1F24",
  muted: "#6B7280",
  line: "#C5CDD6",
  lineSelected: "#0084FF",
  cardBorder: "#E5E7EB",
} as const;

export type NodeTone = {
  hex: string;
  family: "start" | "content" | "input" | "action" | "stop";
};

export const NODE_TONE: Record<CanvasNodeKind, NodeTone> = {
  trigger: { hex: MANYCHAT.start, family: "start" },
  message: { hex: MANYCHAT.content, family: "content" },
  media: { hex: MANYCHAT.content, family: "content" },
  buttons: { hex: MANYCHAT.content, family: "content" },
  capture: { hex: MANYCHAT.input, family: "input" },
  tag: { hex: MANYCHAT.action, family: "action" },
  end: { hex: MANYCHAT.stop, family: "stop" },
};

export function nodeHex(kind: string | undefined): string {
  if (kind && kind in NODE_TONE) return NODE_TONE[kind as CanvasNodeKind].hex;
  return MANYCHAT.content;
}
