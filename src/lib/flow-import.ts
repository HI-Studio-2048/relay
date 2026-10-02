import type { FlowDefinition, TriggerType } from "@/lib/types";
import { TRIGGER_OPTIONS } from "@/lib/types";

/** A flow as a portable JSON file (Flows → Export / Import). */
export type FlowExport = {
  relay: "flow";
  version: 1;
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  definition: FlowDefinition;
};

const STEP_TYPES = new Set([
  "text", "gallery", "capture", "tag", "set_field", "delay", "randomizer", "condition", "form", "subscribe",
  "start_flow", "http", "notify", "ai", "goal", "end",
]);

export class FlowImportError extends Error {}

/** Keep only known definition keys: steps, start, finite canvas positions, and a safe trigger subset. */
function cleanDefinition(definition: FlowDefinition, steps: FlowDefinition["steps"]): FlowDefinition {
  const nodes: Record<string, { x: number; y: number }> = {};
  const rawNodes = (definition.canvas as { nodes?: Record<string, unknown> } | undefined)?.nodes;
  if (rawNodes && typeof rawNodes === "object") {
    for (const [id, position] of Object.entries(rawNodes)) {
      const point = position as { x?: unknown; y?: unknown } | null;
      if (id === "__proto__" || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      nodes[id] = { x: Number(point.x), y: Number(point.y) };
    }
  }
  const trigger = definition.trigger;
  const safeTrigger = trigger
    ? {
        ...(Array.isArray(trigger.publicReplies) ? { publicReplies: trigger.publicReplies.filter((line) => typeof line === "string").slice(0, 20) } : {}),
        ...(trigger.oncePerContact ? { oncePerContact: true } : {}),
        ...(trigger.excludeReplies ? { excludeReplies: true } : {}),
        ...(trigger.hideAfterReply ? { hideAfterReply: true } : {}),
        ...(trigger.aiPublicReply ? { aiPublicReply: true } : {}),
      }
    : undefined;
  return {
    startStepId: definition.startStepId,
    steps,
    ...(Object.keys(nodes).length ? { canvas: { nodes } } : {}),
    ...(safeTrigger ? { trigger: safeTrigger } : {}),
  };
}

export function exportFlow(flow: { name: string; triggerType: string; triggerValue: string | null; definition: FlowDefinition }): FlowExport {
  const { canvas, ...rest } = flow.definition;
  return {
    relay: "flow",
    version: 1,
    name: flow.name,
    triggerType: flow.triggerType as TriggerType,
    triggerValue: flow.triggerValue,
    definition: { ...rest, ...(canvas ? { canvas } : {}) },
  };
}

/**
 * Check an uploaded file before it becomes a flow: known step types, unique ids, a start step that
 * exists, and links to other flows dropped (their ids belong to the other account).
 */
export function parseFlowImport(raw: unknown): { flow: FlowExport; warnings: string[] } {
  const input = raw as Partial<FlowExport> | null;
  if (!input || typeof input !== "object" || input.relay !== "flow") throw new FlowImportError("This is not a Relay flow file");
  const definition = input.definition as FlowDefinition | undefined;
  if (!definition || !Array.isArray(definition.steps) || definition.steps.length === 0) throw new FlowImportError("The file has no steps");
  if (definition.steps.length > 300) throw new FlowImportError("That flow is too large (300 steps max)");
  const ids = new Set<string>();
  const warnings: string[] = [];
  if (JSON.stringify(definition).length > 1_000_000) throw new FlowImportError("That flow file is too large");
  const steps = definition.steps.map((step) => {
    if (!step || typeof step.id !== "string" || !step.id || !STEP_TYPES.has(step.type)) {
      throw new FlowImportError(`Unknown step in the file: ${JSON.stringify(step).slice(0, 80)}`);
    }
    if (ids.has(step.id)) throw new FlowImportError(`Two steps share the id “${step.id}”`);
    ids.add(step.id);
    if (step.type === "start_flow") {
      warnings.push("A “Start flow” step pointed at a flow in another account; pick the target again.");
      return { ...step, flowId: "" };
    }
    if (step.type === "http") {
      // A shared file must not be able to ship contact data to someone else's server.
      warnings.push(`An HTTP request step to ${String(step.url).slice(0, 80)} was cleared; re-enter the URL if you trust it.`);
      return { ...step, url: "" };
    }
    return step;
  });
  if (!ids.has(definition.startStepId)) throw new FlowImportError("The start step is missing");
  const triggerType = TRIGGER_OPTIONS.some((option) => option.value === input.triggerType) ? input.triggerType! : "keyword_contains";
  if (triggerType !== input.triggerType) warnings.push("Unknown trigger; set to “Message contains”.");
  return {
    flow: {
      relay: "flow",
      version: 1,
      name: (typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Imported flow").slice(0, 120),
      triggerType,
      triggerValue: typeof input.triggerValue === "string" ? input.triggerValue.slice(0, 500) : null,
      definition: cleanDefinition(definition, steps),
    },
    warnings,
  };
}
