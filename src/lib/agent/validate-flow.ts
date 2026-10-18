import type { FlowDefinition, FlowStep } from "@/lib/types";

const FIELD = /^(name|email|phone|custom:[a-z][a-z0-9_]{0,40})$/;

const STEP_TYPES = new Set([
  "text",
  "capture",
  "tag",
  "set_field",
  "delay",
  "randomizer",
  "condition",
  "form",
  "subscribe",
  "start_flow",
  "http",
  "notify",
  "ai",
  "goal",
  "gallery",
  "end",
]);

function linkError(ids: Set<string>, from: string, target: string | undefined, label: string) {
  if (!target) return null;
  if (!ids.has(target)) return `${from} ${label} points at missing step ${target}`;
  return null;
}

/**
 * Structural check before a draft is saved. Dangling links and unknown fields are rejected so the
 * canvas and the engine see the same flow.
 */
export function validateFlowDefinition(definition: FlowDefinition): string[] {
  const errors: string[] = [];
  if (!definition?.steps?.length) return ["A flow needs at least one step"];
  const ids = new Set<string>();
  for (const step of definition.steps) {
    if (!step?.id) {
      errors.push("A step is missing an id");
      continue;
    }
    if (ids.has(step.id)) errors.push(`Duplicate step id ${step.id}`);
    ids.add(step.id);
    if (!STEP_TYPES.has(step.type)) errors.push(`Unknown step type on ${step.id}`);
  }
  if (!definition.startStepId || !ids.has(definition.startStepId)) errors.push("startStepId does not match a step");

  const links: (string | null)[] = [];
  for (const step of definition.steps) {
    links.push(...stepLinks(ids, step));
  }
  for (const error of links) if (error) errors.push(error);
  return errors;
}

function stepLinks(ids: Set<string>, step: FlowStep): (string | null)[] {
  if (step.type === "text") {
    return [
      linkError(ids, step.id, step.next, "next"),
      ...(step.buttons ?? []).map((button) => linkError(ids, step.id, button.next, "button")),
      ...(step.quickReplies ?? []).map((reply) => linkError(ids, step.id, reply.next, "quick reply")),
    ];
  }
  if (step.type === "capture") {
    return [
      step.next && ids.has(step.next) ? null : `${step.id} next must point at a step`,
      FIELD.test(step.field) ? null : `${step.id} field "${step.field}" must be name, email, phone, or custom:key`,
    ];
  }
  if (step.type === "tag") {
    return [
      step.next && ids.has(step.next) ? null : `${step.id} next must point at a step`,
      step.tagName.trim() ? null : `${step.id} needs a tag name`,
    ];
  }
  if (step.type === "set_field") {
    return [
      step.next && ids.has(step.next) ? null : `${step.id} next must point at a step`,
      FIELD.test(step.field) ? null : `${step.id} field "${step.field}" must be name, email, phone, or custom:key`,
    ];
  }
  if (step.type === "form") {
    return [
      step.next && ids.has(step.next) ? null : `${step.id} next must point at a step`,
      ...step.fields.map((field) => (FIELD.test(field.field) ? null : `${step.id} has a field that is not name, email, phone, or custom:key`)),
    ];
  }
  if (
    step.type === "delay" ||
    step.type === "subscribe" ||
    step.type === "http" ||
    step.type === "notify"
  ) {
    return [step.next && ids.has(step.next) ? null : `${step.id} next must point at a step`];
  }
  if (step.type === "condition") {
    return [
      ids.has(step.nextTrue) ? null : `${step.id} nextTrue must point at a step`,
      ids.has(step.nextFalse) ? null : `${step.id} nextFalse must point at a step`,
    ];
  }
  if (step.type === "randomizer") {
    return step.paths.map((path) => linkError(ids, step.id, path.next, "path"));
  }
  if (step.type === "gallery") {
    return [
      linkError(ids, step.id, step.next, "next"),
      ...step.cards.flatMap((card) => (card.buttons ?? []).map((button) => linkError(ids, step.id, button.next, "button"))),
    ];
  }
  if (step.type === "start_flow" || step.type === "ai" || step.type === "goal") {
    return [linkError(ids, step.id, step.next, "next")];
  }
  return [];
}
