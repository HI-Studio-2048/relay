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

function applySubscribe(
  contact: ContactRecord,
  listName: string,
  action: "subscribe" | "unsubscribe",
): ContactRecord {
  const name = listName.trim();
  const subscriptions = contact.subscriptions ?? [];
  if (action === "unsubscribe" && (!name || name.toLowerCase() === "all")) {
    return { ...contact, unsubscribed: true, subscriptions };
  }
  if (action === "subscribe") {
    const tagged = applyTag(contact, name, "add");
    const lists = subscriptions.some((item) => item.toLowerCase() === name.toLowerCase())
      ? subscriptions
      : [...subscriptions, name];
    return { ...tagged, subscriptions: lists, unsubscribed: false };
  }
  return {
    ...applyTag(contact, name, "remove"),
    subscriptions: subscriptions.filter((item) => item.toLowerCase() !== name.toLowerCase()),
  };
}

function applyTag(contact: ContactRecord, tagName: string, action: "add" | "remove"): ContactRecord {
  const name = tagName.trim();
  if (!name) return contact;
  const lower = name.toLowerCase();
  if (action === "remove") {
    return { ...contact, tags: contact.tags.filter((tag) => tag.toLowerCase() !== lower) };
  }
  if (contact.tags.some((tag) => tag.toLowerCase() === lower)) return contact;
  return { ...contact, tags: [...contact.tags, name] };
}

export function executeFrom(
  definition: FlowDefinition,
  session: FlowSessionState,
  contact: ContactRecord,
  now = Date.now(),
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
      const buttons = step.buttons?.map((button) =>
        button.url
          ? { text: button.text, url: button.url }
          : { text: button.text, data: `n:${button.next ?? ""}` },
      );
      replies.push({
        text: step.text,
        media: step.media,
        buttons,
        source: "flow",
      });
      const hasCallback = (step.buttons ?? []).some((button) => !button.url && button.next);
      if (hasCallback) {
        current = { ...current, awaitingInput: false, resumeAt: null };
        return { session: current, replies, contact: nextContact };
      }
      if (step.next) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      return { session: null, replies, contact: nextContact };
    }

    if (step.type === "capture") {
      replies.push({ text: step.prompt, source: "flow" });
      current = { ...current, awaitingInput: true, formIndex: undefined, resumeAt: null };
      return { session: current, replies, contact: nextContact };
    }

    if (step.type === "form") {
      const fields = step.fields.filter((field) => field.field && field.prompt.trim());
      if (fields.length === 0) {
        current = { ...current, stepId: step.next, awaitingInput: false, formIndex: undefined };
        continue;
      }
      const index = current.formIndex ?? 0;
      if (index === 0 && step.intro?.trim()) {
        replies.push({ text: step.intro, source: "flow" });
      }
      const field = fields[Math.min(index, fields.length - 1)]!;
      replies.push({ text: field.prompt, source: "flow" });
      current = { ...current, awaitingInput: true, formIndex: index, resumeAt: null };
      return { session: current, replies, contact: nextContact };
    }

    if (step.type === "tag") {
      nextContact = applyTag(nextContact, step.tagName, step.action === "remove" ? "remove" : "add");
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "set_field") {
      try {
        const field = parseCaptureField(step.field);
        nextContact = assignFieldValue(nextContact, field, step.value ?? "");
      } catch {
        // Unknown field keys are ignored so a bad step does not stall Telegram.
      }
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "subscribe") {
      nextContact = applySubscribe(nextContact, step.listName, step.action);
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "delay") {
      const wait = Math.max(0, Math.floor(step.seconds || 0));
      if (wait <= 0) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      const due = current.resumeAt ? Date.parse(current.resumeAt) : NaN;
      if (Number.isFinite(due) && due <= now) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      current = {
        ...current,
        awaitingInput: false,
        resumeAt: new Date(now + wait * 1000).toISOString(),
      };
      return { session: current, replies, contact: nextContact };
    }

    if (step.type === "condition") {
      const ok = evaluateCondition(nextContact, step);
      const next = ok ? step.nextTrue : step.nextFalse;
      if (!next) return { session: null, replies, contact: nextContact };
      current = { ...current, stepId: next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "end") {
      if (step.text) replies.push({ text: step.text, source: "flow" });
      return { session: { ...current, status: "completed", awaitingInput: false, resumeAt: null }, replies, contact: nextContact };
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
      subscriptions: existing.subscriptions ?? [],
      unsubscribed: existing.unsubscribed ?? false,
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
    subscriptions: [],
    unsubscribed: false,
  };
}

export function processInboundEvent(input: {
  contact: ContactRecord | null;
  session: FlowSessionState | null;
  flows: FlowRecord[];
  event: InboundEvent;
  now?: number;
}): EngineResult {
  let contact = upsertFromEvent(input.contact, input.event);
  const inboundSaved = Boolean(input.event.text || input.event.callbackData);
  const now = input.now ?? Date.now();

  const flowById = new Map(input.flows.map((flow) => [flow.id, flow]));

  if (input.event.callbackData) {
    const nextId = input.event.callbackData.startsWith("n:")
      ? input.event.callbackData.slice(2)
      : null;
    if (nextId && input.session) {
      const flow = flowById.get(input.session.flowId);
      if (flow) {
        const executed = executeFrom(
          flow.definition,
          { ...input.session, stepId: nextId, awaitingInput: false, resumeAt: null },
          contact,
          now,
        );
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
          { ...input.session, stepId: step.next, awaitingInput: false, formIndex: undefined },
          contact,
          now,
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
    if (flow && step?.type === "form") {
      const fields = step.fields.filter((field) => field.field && field.prompt.trim());
      const index = input.session.formIndex ?? 0;
      const currentField = fields[index];
      if (currentField) {
        try {
          contact = applyCapturedValue(contact, parseCaptureField(currentField.field), input.event.text);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Please try again.";
          return {
            contact,
            session: input.session,
            replies: [{ text: message, source: "flow" }],
            inboundSaved,
          };
        }
        const nextIndex = index + 1;
        if (nextIndex < fields.length) {
          const executed = executeFrom(
            flow.definition,
            { ...input.session, awaitingInput: false, formIndex: nextIndex },
            contact,
            now,
          );
          return {
            contact: executed.contact,
            session: executed.session?.status === "completed" ? null : executed.session,
            replies: executed.replies,
            inboundSaved,
          };
        }
        const executed = executeFrom(
          flow.definition,
          { ...input.session, stepId: step.next, awaitingInput: false, formIndex: undefined },
          contact,
          now,
        );
        return {
          contact: executed.contact,
          session: executed.session?.status === "completed" ? null : executed.session,
          replies: executed.replies,
          inboundSaved,
        };
      }
    }
  }

  const matched = matchFlowTrigger(input.flows, input.event.text);
  if (matched) {
    const session = startSession(contact.id, matched);
    const executed = executeFrom(matched.definition, session, contact, now);
    return {
      contact: executed.contact,
      session: executed.session?.status === "completed" ? null : executed.session,
      replies: executed.replies,
      inboundSaved,
    };
  }

  return { contact, session: input.session, replies: [], inboundSaved };
}
