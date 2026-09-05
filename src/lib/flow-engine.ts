import { applyCapturedValue, assignFieldValue, parseCaptureField } from "@/lib/lead-capture";
import type {
  CaptureField,
  ConditionOp,
  ContactRecord,
  FlowDefinition,
  FlowSessionState,
  FlowStep,
  InboundEvent,
  OutboundReply,
  TriggerType,
} from "@/lib/types";

export type FlowRecord = {
  id: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  definition: FlowDefinition;
};

export type EngineResult = {
  contact: ContactRecord;
  session: FlowSessionState | null;
  replies: OutboundReply[];
  inboundSaved: boolean;
};

function newId(): string {
  return crypto.randomUUID();
}

function stepById(definition: FlowDefinition, id: string): FlowStep | undefined {
  return definition.steps.find((step) => step.id === id);
}

export function parseStartPayload(text: string): { isStart: boolean; payload: string | null } {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/start(?:@\S+)?(?:\s+(.+))?$/i);
  if (!match) return { isStart: false, payload: null };
  const payload = match[1]?.trim() || null;
  return { isStart: true, payload };
}

export function matchFlowTrigger(flows: FlowRecord[], text: string | null | undefined): FlowRecord | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const start = parseStartPayload(trimmed);
  if (start.isStart) {
    if (start.payload) {
      const param = start.payload.toLowerCase();
      const targeted = flows.find((flow) => {
        if (!flow.isActive || flow.triggerType !== "start_param") return false;
        return (flow.triggerValue ?? "").trim().toLowerCase() === param;
      });
      if (targeted) return targeted;
    }
    return flows.find((flow) => flow.isActive && flow.triggerType === "start") ?? null;
  }

  if (trimmed.startsWith("/")) {
    const command = trimmed.split(/\s+/)[0]!.replace(/@.+$/, "").toLowerCase();
    return (
      flows.find((flow) => {
        if (!flow.isActive || flow.triggerType !== "command") return false;
        const value = (flow.triggerValue ?? "").trim().toLowerCase();
        const normalized = value.startsWith("/") ? value : `/${value}`;
        return normalized === command;
      }) ?? null
    );
  }

  const keyword = trimmed.toLowerCase();
  return (
    flows.find((flow) => {
      if (!flow.isActive || flow.triggerType !== "keyword") return false;
      const value = (flow.triggerValue ?? "").trim().toLowerCase();
      return value.length > 0 && keyword === value;
    }) ?? null
  );
}

function startSession(contactId: string, flow: FlowRecord): FlowSessionState {
  return {
    id: newId(),
    contactId,
    flowId: flow.id,
    stepId: flow.definition.startStepId,
    awaitingInput: false,
    status: "active",
  };
}

function contactFieldValue(contact: ContactRecord, field: CaptureField): string {
  if (field === "name") return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  if (field === "email") return contact.email ?? "";
  if (field === "phone") return contact.phone ?? "";
  return contact.customFields[field.slice("custom:".length)] ?? "";
}

export function evaluateCondition(
  contact: ContactRecord,
  step: Extract<FlowStep, { type: "condition" }>,
): boolean {
  if (step.check === "tag") {
    const name = (step.tagName ?? "").trim().toLowerCase();
    return name.length > 0 && contact.tags.some((tag) => tag.toLowerCase() === name);
  }
  if (step.check === "subscription") {
    const name = (step.tagName ?? "").trim().toLowerCase();
    if (!name || name === "all") return !contact.unsubscribed;
    return (contact.subscriptions ?? []).some((item) => item.toLowerCase() === name);
  }
  const field = step.field ?? "email";
  const raw = contactFieldValue(contact, field);
  const op: ConditionOp = step.op ?? "set";
  if (op === "set") return raw.trim().length > 0;
  const expected = (step.value ?? "").trim().toLowerCase();
  const actual = raw.trim().toLowerCase();
  if (op === "contains") return expected.length > 0 && actual.includes(expected);
  return expected.length > 0 && actual === expected;
}
