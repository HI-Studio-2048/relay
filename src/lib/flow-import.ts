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
      definition: { ...definition, steps },
    },
    warnings,
  };
}
