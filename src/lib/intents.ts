import { matchFlowTrigger, type FlowRecord } from "@/lib/flow-engine";
import type { FlowSessionState } from "@/lib/types";

/**
 * AI intent triggers: a flow whose Match is a plain-language description ("asking about shipping
 * times"). Keywords stay the fast path; intents are checked only when a message matched nothing more
 * specific than the default reply. Pure, so the routing rules are testable without the model.
 */
export function intentFlows(flows: FlowRecord[]) {
  return flows.filter((flow) => flow.isActive && flow.triggerType === "intent" && (flow.triggerValue ?? "").trim());
}

export function shouldCheckIntents(input: {
  flows: FlowRecord[];
  session: FlowSessionState | null;
  text: string | null | undefined;
  callbackData?: string | null;
}) {
  const text = input.text?.trim();
  if (!text || input.callbackData || text.startsWith("/")) return false;
  if (input.session && (input.session.awaitingInput || input.session.status === "paused")) return false;
  if (intentFlows(input.flows).length === 0) return false;
  const matched = matchFlowTrigger(input.flows, text);
  return !matched || matched.triggerType === "default";
}

/** Make the chosen intent flow the one that answers this message (it outranks the default reply). */
export function routeToIntent(flows: FlowRecord[], flowId: string): FlowRecord[] {
  const target = flows.find((flow) => flow.id === flowId);
  if (!target) return flows;
  return [{ ...target, triggerType: "default" }, ...flows.filter((flow) => flow.id !== flowId)];
}
