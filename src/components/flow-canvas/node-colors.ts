import type { CanvasNodeKind } from "@/lib/flow-canvas";
import { RELAY } from "@/lib/theme";

export { MANYCHAT, RELAY } from "@/lib/theme";

export type NodeTone = {
  hex: string;
  family: "start" | "content" | "input" | "action" | "stop";
};

export const NODE_TONE: Record<CanvasNodeKind, NodeTone> = {
  trigger: { hex: RELAY.start, family: "start" },
  message: { hex: RELAY.content, family: "content" },
  media: { hex: RELAY.content, family: "content" },
  buttons: { hex: RELAY.content, family: "content" },
  capture: { hex: RELAY.input, family: "input" },
  form: { hex: RELAY.input, family: "input" },
  tag: { hex: RELAY.action, family: "action" },
  set_field: { hex: RELAY.setField, family: "action" },
  subscribe: { hex: RELAY.subscribe, family: "action" },
  delay: { hex: RELAY.delay, family: "action" },
  condition: { hex: RELAY.condition, family: "action" },
  end: { hex: RELAY.stop, family: "stop" },
};

export function nodeHex(kind: string | undefined): string {
  if (kind && kind in NODE_TONE) return NODE_TONE[kind as CanvasNodeKind].hex;
  return RELAY.content;
}
