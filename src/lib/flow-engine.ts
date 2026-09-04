import { applyCapturedValue, parseCaptureField } from "@/lib/lead-capture";
import type {
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

export function matchFlowTrigger(flows: FlowRecord[], text: string | null | undefined): FlowRecord | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const isStart = trimmed === "/start" || trimmed.startsWith("/start@") || trimmed.startsWith("/start ");
  if (isStart) {
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

function executeFrom(
  definition: FlowDefinition,
  session: FlowSessionState,
  contact: ContactRecord,
): { session: FlowSessionState | null; replies: OutboundReply[]; contact: ContactRecord } {
  let current = { ...session };
  let nextContact = contact;
  const replies: OutboundReply[] = [];
  const seen = new Set<string>();

  while (current.status === "active") {
    if (seen.has(current.stepId)) break;
    seen.add(current.stepId);
    const step = stepById(definition, current.stepId);
    if (!step) {
      return { session: null, replies, contact: nextContact };
    }

    if (step.type === "text") {
      replies.push({
        text: step.text,
        buttons: step.buttons?.map((button) => ({
          text: button.text,
          data: `n:${button.next}`,
        })),
        source: "flow",
      });
      if (step.buttons && step.buttons.length > 0) {
        current = { ...current, awaitingInput: false };
        return { session: current, replies, contact: nextContact };
      }
      if (step.next) {
        current = { ...current, stepId: step.next, awaitingInput: false };
        continue;
      }
      return { session: null, replies, contact: nextContact };
    }

    if (step.type === "capture") {
      replies.push({ text: step.prompt, source: "flow" });
      current = { ...current, awaitingInput: true };
      return { session: current, replies, contact: nextContact };
    }

    if (step.type === "tag") {
      if (!nextContact.tags.includes(step.tagName)) {
        nextContact = { ...nextContact, tags: [...nextContact.tags, step.tagName] };
      }
      current = { ...current, stepId: step.next, awaitingInput: false };
      continue;
    }

    if (step.type === "end") {
      if (step.text) replies.push({ text: step.text, source: "flow" });
      return { session: { ...current, status: "completed", awaitingInput: false }, replies, contact: nextContact };
    }
  }

  return { session: current, replies, contact: nextContact };
}

function upsertFromEvent(existing: ContactRecord | null, event: InboundEvent): ContactRecord {
  if (existing) {
    return {
      ...existing,
      username: event.username ?? existing.username,
      firstName: existing.firstName || event.firstName || null,
      lastName: existing.lastName || event.lastName || null,
    };
  }
  return {
    id: newId(),
    telegramUserId: event.telegramUserId,
    username: event.username ?? null,
    firstName: event.firstName ?? null,
    lastName: event.lastName ?? null,
    email: null,
    phone: null,
    customFields: {},
    tags: [],
  };
}

export function processInboundEvent(input: {
  contact: ContactRecord | null;
  session: FlowSessionState | null;
  flows: FlowRecord[];
  event: InboundEvent;
}): EngineResult {
  let contact = upsertFromEvent(input.contact, input.event);
  const inboundSaved = Boolean(input.event.text || input.event.callbackData);

  const flowById = new Map(input.flows.map((flow) => [flow.id, flow]));

  if (input.event.callbackData) {
    const nextId = input.event.callbackData.startsWith("n:")
      ? input.event.callbackData.slice(2)
      : null;
    if (nextId && input.session) {
      const flow = flowById.get(input.session.flowId);
      if (flow) {
        const executed = executeFrom(flow.definition, { ...input.session, stepId: nextId, awaitingInput: false }, contact);
        return {
          contact: executed.contact,
          session: executed.session?.status === "completed" ? null : executed.session,
          replies: executed.replies,
          inboundSaved,
        };
      }
    }
  }

  if (input.session?.awaitingInput && input.event.text) {
    const flow = flowById.get(input.session.flowId);
    const step = flow ? stepById(flow.definition, input.session.stepId) : undefined;
    if (flow && step?.type === "capture") {
      try {
        contact = applyCapturedValue(contact, parseCaptureField(step.field), input.event.text);
        const executed = executeFrom(
          flow.definition,
          { ...input.session, stepId: step.next, awaitingInput: false },
          contact,
        );
        return {
          contact: executed.contact,
          session: executed.session?.status === "completed" ? null : executed.session,
          replies: executed.replies,
          inboundSaved,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Please try again.";
        return {
          contact,
          session: input.session,
          replies: [{ text: message, source: "flow" }],
          inboundSaved,
        };
      }
    }
  }

  const matched = matchFlowTrigger(input.flows, input.event.text);
  if (matched) {
    const session = startSession(contact.id, matched);
    const executed = executeFrom(matched.definition, session, contact);
    return {
      contact: executed.contact,
      session: executed.session?.status === "completed" ? null : executed.session,
      replies: executed.replies,
      inboundSaved,
    };
  }

  return { contact, session: input.session, replies: [], inboundSaved };
}
