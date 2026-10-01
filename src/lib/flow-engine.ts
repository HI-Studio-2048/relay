import { applyCapturedValue, assignFieldValue, parseCaptureField } from "@/lib/lead-capture";
import {
  compareKeywordPriority,
  isKeywordTrigger,
  matchesKeywordRule,
  parseKeywordList,
} from "@/lib/keywords";
import { chooseRandomizerPath, nextResumeAt } from "@/lib/smart-delay";
import { flowIdFromPayload } from "@/lib/starters";
import { alreadyAnswered, markAnswered, matchSocialFlow, pickPublicReply } from "@/lib/social-triggers";
import { stepButtons } from "@/lib/types";
import type {
  CaptureField,
  ConditionOp,
  ConditionRule,
  ContactRecord,
  FlowButton,
  FlowDefinition,
  FlowEffect,
  FlowSessionState,
  FlowStep,
  InboundEvent,
  OutboundReply,
  SetFieldMode,
  TriggerType,
} from "@/lib/types";

export type FlowRecord = {
  id: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  priority?: number;
  definition: FlowDefinition;
};

export type EngineResult = {
  contact: ContactRecord;
  session: FlowSessionState | null;
  replies: OutboundReply[];
  inboundSaved: boolean;
  effects: FlowEffect[];
  /** Comment trigger: text to post publicly under the comment. */
  publicReply?: string | null;
  /** Comment trigger: the first reply must go out as a private reply to the comment. */
  privateReply?: boolean;
  /** Flow that a social trigger matched, for analytics. */
  matchedFlowId?: string | null;
  /** Analytics: a flow run that started on this event. */
  startedFlowId?: string | null;
  /** Analytics: flows whose run reached a Stop step on this event. */
  completedFlowIds?: string[];
  /** Analytics: a quick reply the contact tapped (typed), attributed to the step that offered it. */
  clicked?: { flowId: string; stepId: string } | null;
};

type ExecuteResult = {
  session: FlowSessionState | null;
  replies: OutboundReply[];
  contact: ContactRecord;
  effects: FlowEffect[];
  completedFlowIds?: string[];
};

const MAX_FLOW_HOPS = 5;

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
  const ranked = flows
    .filter((flow) => flow.isActive && isKeywordTrigger(flow.triggerType))
    .slice()
    .sort(compareKeywordPriority);
  for (const flow of ranked) {
    if (!isKeywordTrigger(flow.triggerType)) continue;
    if (matchesKeywordRule(flow.triggerType, keyword, parseKeywordList(flow.triggerValue))) {
      return flow;
    }
  }

  return flows.find((flow) => flow.isActive && flow.triggerType === "default") ?? null;
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

export function evaluateRule(contact: ContactRecord, rule: ConditionRule): boolean {
  if (rule.check === "tag" || rule.check === "subscription") {
    const name = (rule.tagName ?? "").trim().toLowerCase();
    let has: boolean;
    if (rule.check === "tag") has = name.length > 0 && contact.tags.some((tag) => tag.toLowerCase() === name);
    else if (!name || name === "all") has = !contact.unsubscribed;
    else has = (contact.subscriptions ?? []).some((item) => item.toLowerCase() === name);
    return rule.op === "not_set" ? !has : has;
  }
  const field = rule.field ?? "email";
  const raw = contactFieldValue(contact, field);
  const op: ConditionOp = rule.op ?? "set";
  if (op === "set") return raw.trim().length > 0;
  if (op === "not_set") return raw.trim().length === 0;
  const expected = (rule.value ?? "").trim().toLowerCase();
  const actual = raw.trim().toLowerCase();
  if (op === "gt" || op === "lt") {
    const a = Number(actual);
    const b = Number(expected);
    if (!actual || !expected || !Number.isFinite(a) || !Number.isFinite(b)) return false;
    return op === "gt" ? a > b : a < b;
  }
  if (op === "contains") return expected.length > 0 && actual.includes(expected);
  if (op === "not_contains") return expected.length === 0 || !actual.includes(expected);
  if (op === "neq") return actual !== expected;
  return expected.length > 0 && actual === expected;
}

/** All rules (or any, with match: "any"). The step's own check is the first rule. */
export function evaluateCondition(
  contact: ContactRecord,
  step: Extract<FlowStep, { type: "condition" }>,
): boolean {
  const rules: ConditionRule[] = [step, ...(step.extra ?? [])];
  return step.match === "any" ? rules.some((rule) => evaluateRule(contact, rule)) : rules.every((rule) => evaluateRule(contact, rule));
}

/** Set field with add/subtract: numbers only; a blank or non-numeric current value counts as 0. */
export function nextFieldValue(current: string, value: string, mode: SetFieldMode | undefined): string {
  if (!mode || mode === "set") return value;
  const base = Number(current.trim() || "0");
  const delta = Number(value.trim() || "0");
  const result = (Number.isFinite(base) ? base : 0) + (mode === "subtract" ? -1 : 1) * (Number.isFinite(delta) ? delta : 0);
  return String(Math.round(result * 1e6) / 1e6);
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

/** ManyChat "Skip" quick reply on a User Input step. */
export const SKIP_LABEL = "Skip";

export function isSkipAnswer(text: string | null | undefined): boolean {
  return (text ?? "").trim().toLowerCase() === SKIP_LABEL.toLowerCase();
}

function activeQuickReplies(step: Extract<FlowStep, { type: "text" }>) {
  return (step.quickReplies ?? []).filter((reply) => reply.text.trim().length > 0);
}

/** Match a typed (or tapped) quick reply against the step the session is waiting on. */
export function matchQuickReply(
  step: FlowStep | undefined,
  text: string | null | undefined,
): { text: string; next?: string } | null {
  if (!step || step.type !== "text" || !text) return null;
  const wanted = text.trim().toLowerCase();
  if (!wanted) return null;
  return activeQuickReplies(step).find((reply) => reply.text.trim().toLowerCase() === wanted) ?? null;
}

/** After a quick reply is chosen, the first plain reply clears the one-time keyboard. */
function withKeyboardCleared(executed: ExecuteResult): ExecuteResult {
  const index = executed.replies.findIndex((reply) => !reply.keyboard);
  if (index === -1) return executed;
  const replies = executed.replies.slice();
  const first = replies[index]!;
  if (!first.buttons?.length) replies[index] = { ...first, removeKeyboard: true };
  return { ...executed, replies };
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
  flows: FlowRecord[] = [],
  hopCount = 0,
): ExecuteResult {
  let current = { ...session };
  let nextContact = contact;
  const replies: OutboundReply[] = [];
  const effects: FlowEffect[] = [];
  const seen = new Set<string>();

  while (current.status === "active") {
    if (seen.has(current.stepId)) break;
    seen.add(current.stepId);
    const step = stepById(definition, current.stepId);
    if (!step) {
      return { session: null, replies, contact: nextContact, effects };
    }

    if (step.type === "text") {
      const inline = step.buttons?.map((button) =>
        button.url
          ? { text: button.text, url: button.url }
          : { text: button.text, data: `n:${button.next ?? ""}` },
      );
      const quickReplies = activeQuickReplies(step);
      // Telegram allows one reply_markup per message: inline buttons win, and quick replies
      // fall back to callback buttons so every choice still renders.
      const buttons =
        inline && inline.length > 0 && quickReplies.length > 0
          ? [...inline, ...quickReplies.map((reply) => ({ text: reply.text, data: `n:${reply.next ?? ""}` }))]
          : inline;
      const keyboard =
        (!inline || inline.length === 0) && quickReplies.length > 0
          ? quickReplies.map((reply) => reply.text)
          : undefined;
      replies.push({
        text: step.text,
        media: step.media,
        buttons,
        ...(keyboard ? { keyboard } : {}),
        source: "flow",
        flowId: current.flowId,
        stepId: step.id,
      });
      if (quickReplies.length > 0) {
        // Quick replies wait for the contact's tap; each one is its own exit.
        current = { ...current, awaitingInput: true, formIndex: undefined, resumeAt: null };
        return { session: current, replies, contact: nextContact, effects };
      }
      const hasCallback = (step.buttons ?? []).some((button) => !button.url && button.next);
      if (step.next) {
        // A Send Message node keeps sending its later blocks even when an earlier block has buttons.
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      if (hasCallback) {
        current = { ...current, awaitingInput: false, resumeAt: null };
        return { session: current, replies, contact: nextContact, effects };
      }
      return { session: null, replies, contact: nextContact, effects };
    }

    if (step.type === "gallery") {
      const toOutbound = (button: FlowButton) =>
        button.url ? { text: button.text, url: button.url } : { text: button.text, data: `n:${button.next ?? ""}` };
      replies.push({
        text: step.text ?? "",
        cards: step.cards.slice(0, 10).map((card) => ({
          title: card.title,
          ...(card.subtitle ? { subtitle: card.subtitle } : {}),
          ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
          ...(card.url ? { url: card.url } : {}),
          ...(card.buttons?.length ? { buttons: card.buttons.slice(0, 3).map(toOutbound) } : {}),
        })),
        source: "flow",
        flowId: current.flowId,
        stepId: step.id,
      });
      if (step.next) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      if (stepButtons(step).some((button) => !button.url && button.next)) {
        current = { ...current, awaitingInput: false, resumeAt: null };
        return { session: current, replies, contact: nextContact, effects };
      }
      return { session: null, replies, contact: nextContact, effects };
    }

    if (step.type === "capture") {
      replies.push({
        text: step.prompt,
        source: "flow",
        flowId: current.flowId,
        stepId: step.id,
        ...(step.field === "phone" ? { requestContact: true } : {}),
        ...(step.skippable ? { keyboard: [SKIP_LABEL] } : {}),
      });
      current = { ...current, awaitingInput: true, formIndex: undefined, resumeAt: null };
      return { session: current, replies, contact: nextContact, effects };
    }

    if (step.type === "form") {
      const fields = step.fields.filter((field) => field.field && field.prompt.trim());
      if (fields.length === 0) {
        current = { ...current, stepId: step.next, awaitingInput: false, formIndex: undefined };
        continue;
      }
      const index = current.formIndex ?? 0;
      if (index === 0 && step.intro?.trim()) {
        replies.push({ text: step.intro, source: "flow", flowId: current.flowId, stepId: step.id });
      }
      const field = fields[Math.min(index, fields.length - 1)]!;
      replies.push({ text: field.prompt, source: "flow", flowId: current.flowId, stepId: step.id });
      current = { ...current, awaitingInput: true, formIndex: index, resumeAt: null };
      return { session: current, replies, contact: nextContact, effects };
    }

    if (step.type === "tag") {
      nextContact = applyTag(nextContact, step.tagName, step.action === "remove" ? "remove" : "add");
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "set_field") {
      try {
        const field = parseCaptureField(step.field);
        nextContact = assignFieldValue(nextContact, field, nextFieldValue(contactFieldValue(nextContact, field), step.value ?? "", step.mode));
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
      const dueMs = current.resumeAt ? Date.parse(current.resumeAt) : NaN;
      if ((wait <= 0 && !step.sendAfter && !step.sendBefore) || (Number.isFinite(dueMs) && dueMs <= now)) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      const resumeAt = nextResumeAt(now, wait, step.sendAfter, step.sendBefore);
      if (resumeAt.getTime() <= now) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      // A typing delay inside a Send Message node shows Telegram's "typing…" bubble while it waits.
      if (step.group) effects.push({ type: "typing" });
      current = {
        ...current,
        awaitingInput: false,
        resumeAt: resumeAt.toISOString(),
      };
      return { session: current, replies, contact: nextContact, effects };
    }

    if (step.type === "randomizer") {
      const key = `_rand:${step.id}`;
      const saved = step.sticky ? nextContact.customFields[key] : undefined;
      const chosen =
        (saved ? step.paths.find((path) => path.id === saved && path.next) : null) ??
        chooseRandomizerPath(step.paths, Math.random());
      const next = chosen?.next;
      if (step.sticky && chosen) {
        nextContact = {
          ...nextContact,
          customFields: { ...nextContact.customFields, [key]: chosen.id },
        };
      }
      if (!next) return { session: null, replies, contact: nextContact, effects };
      current = { ...current, stepId: next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "condition") {
      const ok = evaluateCondition(nextContact, step);
      const next = ok ? step.nextTrue : step.nextFalse;
      if (!next) return { session: null, replies, contact: nextContact, effects };
      current = { ...current, stepId: next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "http") {
      const url = step.url.trim();
      if (url) {
        effects.push({
          type: "http",
          url,
          method: step.method === "GET" ? "GET" : "POST",
          ...(step.body?.trim() ? { body: step.body } : {}),
        });
      }
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "notify") {
      effects.push({ type: "notify", text: step.text });
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "start_flow") {
      const target = flows.find((flow) => flow.id === step.flowId && flow.isActive);
      if (target && hopCount < MAX_FLOW_HOPS) {
        const hopped = executeFrom(
          target.definition,
          startSession(nextContact.id, target),
          nextContact,
          now,
          flows,
          hopCount + 1,
        );
        return {
          session: hopped.session,
          replies: [...replies, ...hopped.replies],
          contact: hopped.contact,
          effects: [...effects, ...hopped.effects],
          completedFlowIds: hopped.completedFlowIds,
        };
      }
      if (step.next) {
        current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
        continue;
      }
      return { session: null, replies, contact: nextContact, effects };
    }

    if (step.type === "goal") {
      effects.push({
        type: "goal",
        flowId: current.flowId,
        stepId: step.id,
        name: step.name.trim() || "Goal",
        ...(typeof step.value === "number" && Number.isFinite(step.value) ? { value: step.value } : {}),
      });
      if (!step.next) {
        return { session: { ...current, status: "completed", awaitingInput: false, resumeAt: null }, replies, contact: nextContact, effects, completedFlowIds: [current.flowId] };
      }
      current = { ...current, stepId: step.next, awaitingInput: false, resumeAt: null };
      continue;
    }

    if (step.type === "ai") {
      // The AI answers asynchronously (see ai-runtime). The session parks here and every
      // message the contact sends is routed back to this step until the goal is complete.
      effects.push({ type: "ai_turn", flowId: current.flowId, stepId: step.id });
      current = { ...current, awaitingInput: true, formIndex: undefined, resumeAt: null };
      return { session: current, replies, contact: nextContact, effects };
    }

    if (step.type === "end") {
      if (step.text) replies.push({ text: step.text, source: "flow", flowId: current.flowId, stepId: step.id });
      return {
        session: { ...current, status: "completed", awaitingInput: false, resumeAt: null },
        replies,
        contact: nextContact,
        effects,
        completedFlowIds: [current.flowId],
      };
    }
  }

  return { session: current, replies, contact: nextContact, effects };
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
      welcomed: existing.welcomed ?? false,
      notes: existing.notes ?? "",
      inboxStatus: existing.inboxStatus === "closed" ? "closed" : "open",
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
    welcomed: false,
    notes: "",
    inboxStatus: "open",
  };
}

function applySystemKeywords(contact: ContactRecord, text: string | null | undefined): ContactRecord {
  const raw = (text ?? "").trim().toLowerCase();
  if (raw === "stop" || raw === "unsubscribe") {
    return { ...contact, unsubscribed: true };
  }
  if (raw === "subscribe") {
    return { ...contact, unsubscribed: false };
  }
  return contact;
}

function toEngineResult(
  executed: ExecuteResult,
  inboundSaved: boolean,
  startedFlowId: string | null = null,
): EngineResult {
  return {
    contact: executed.contact,
    session: executed.session?.status === "completed" ? null : executed.session,
    replies: executed.replies,
    inboundSaved,
    effects: executed.effects,
    ...(startedFlowId ? { startedFlowId } : {}),
    ...(executed.completedFlowIds?.length ? { completedFlowIds: executed.completedFlowIds } : {}),
  };
}

/** The callback button a typed "2" or "Pricing" refers to, on the step the session is parked at. */
export function typedButton(
  session: FlowSessionState | null,
  flows: Map<string, FlowRecord>,
  text: string | null | undefined,
): { stepId: string; next: string } | null {
  const typedText = (text ?? "").trim();
  if (!session || !typedText) return null;
  const step = flows.get(session.flowId)?.definition.steps.find((item) => item.id === session.stepId);
  const buttons = stepButtons(step);
  if (!step || buttons.length === 0) return null;
  const sameLabel = buttons.filter((button) => button.text.trim().toLowerCase() === typedText.toLowerCase());
  // A label shared by several buttons (a gallery's "Buy now" on every card) is ambiguous: only a number picks one.
  const index = /^\d{1,2}$/.test(typedText) ? Number(typedText) - 1 : sameLabel.length === 1 ? buttons.indexOf(sameLabel[0]!) : -1;
  const button = index >= 0 ? buttons[index] : undefined;
  if (!button || button.url || !button.next) return null;
  return { stepId: step.id, next: button.next };
}

type InboundInput = {
  contact: ContactRecord | null;
  session: FlowSessionState | null;
  flows: FlowRecord[];
  event: InboundEvent;
  now?: number;
};

function runSocialTrigger(contact: ContactRecord, input: InboundInput, now: number): EngineResult | null {
  const event = input.event;
  const kind = event.kind;
  if (kind !== "comment" && kind !== "story_reply" && kind !== "story_mention") return null;
  // A teammate is talking to them, or a flow is waiting on their answer: a comment or story must
  // not replace that conversation.
  if (input.session && (input.session.status === "paused" || input.session.awaitingInput)) return null;
  const flow = matchSocialFlow(input.flows, {
    kind,
    text: event.text ?? "",
    postId: event.postId,
    platformPostId: event.platformPostId,
    permalink: event.permalink,
    isReply: event.isReply,
  });
  if (!flow) return null;
  const config = flow.definition.trigger;
  if (kind === "comment" && (config?.oncePerContact ?? true) && alreadyAnswered(input.contact, flow.id, event.postId)) {
    return { contact, session: input.session, replies: [], inboundSaved: true, effects: [], matchedFlowId: null };
  }
  const marked = kind === "comment" ? markAnswered(contact, flow.id, event.postId) : contact;
  const executed = executeFrom(flow.definition, startSession(marked.id, flow), marked, now, input.flows);
  return {
    ...toEngineResult(executed, true, flow.id),
    publicReply: kind === "comment" ? pickPublicReply(config) : null,
    privateReply: kind === "comment",
    matchedFlowId: flow.id,
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
  contact = applySystemKeywords(contact, input.event.text);
  const inboundSaved = Boolean(input.event.text || input.event.callbackData || input.event.contactPhone);
  const now = input.now ?? Date.now();
  const start = parseStartPayload(input.event.text ?? "");

  const flowById = new Map(input.flows.map((flow) => [flow.id, flow]));

  const kind = input.event.kind ?? "message";
  if (kind !== "message") {
    const social = runSocialTrigger(contact, input, now);
    if (social) return social;
    // A comment or story mention with no matching automation is logged but never answered;
    // a story reply that matched nothing falls through to normal keyword handling.
    if (kind !== "story_reply") {
      return { contact, session: input.session, replies: [], inboundSaved, effects: [] };
    }
  }

  if (input.session?.status === "paused" && !start.isStart) {
    return { contact, session: input.session, replies: [], inboundSaved, effects: [] };
  }

  // Ice breaker / persistent menu / API payload "flow:<id>": start that flow, whatever was running.
  const starterFlowId = flowIdFromPayload(input.event.callbackData);
  if (starterFlowId) {
    const target = flowById.get(starterFlowId);
    if (target?.isActive) {
      return toEngineResult(
        executeFrom(target.definition, startSession(contact.id, target), contact, now, input.flows),
        inboundSaved,
        target.id,
      );
    }
    return { contact, session: input.session, replies: [], inboundSaved, effects: [] };
  }

  if (input.event.callbackData && input.session?.status !== "paused") {
    const nextId = input.event.callbackData.startsWith("n:")
      ? input.event.callbackData.slice(2)
      : null;
    if (nextId && input.session) {
      const flow = flowById.get(input.session.flowId);
      if (flow) {
        return toEngineResult(
          executeFrom(
            flow.definition,
            { ...input.session, stepId: nextId, awaitingInput: false, resumeAt: null },
            contact,
            now,
            input.flows,
          ),
          inboundSaved,
        );
      }
    }
  }

  // Platforms without buttons show them as "1. Option": a typed number (or the exact label) picks it.
  const typed = typedButton(input.session, flowById, input.event.text);
  if (typed && input.session && input.session.status !== "paused") {
    const flow = flowById.get(input.session.flowId)!;
    return {
      ...toEngineResult(
        executeFrom(flow.definition, { ...input.session, stepId: typed.next, awaitingInput: false, resumeAt: null }, contact, now, input.flows),
        inboundSaved,
      ),
      clicked: { flowId: flow.id, stepId: typed.stepId },
    };
  }

  const answer = input.event.text || input.event.contactPhone || null;
  if (input.session?.awaitingInput && answer && input.session.status !== "paused") {
    const flow = flowById.get(input.session.flowId);
    const step = flow ? stepById(flow.definition, input.session.stepId) : undefined;
    const quickReply = flow ? matchQuickReply(step, input.event.text) : null;
    if (flow && quickReply) {
      const clicked = { flowId: flow.id, stepId: input.session.stepId };
      if (!quickReply.next) {
        return { contact, session: null, replies: [], inboundSaved, effects: [], clicked };
      }
      const executed = withKeyboardCleared(
        executeFrom(
          flow.definition,
          { ...input.session, stepId: quickReply.next, awaitingInput: false, formIndex: undefined, resumeAt: null },
          contact,
          now,
          input.flows,
        ),
      );
      return { ...toEngineResult(executed, inboundSaved), clicked };
    }
    if (flow && step?.type === "ai") {
      return {
        contact,
        session: input.session,
        replies: [],
        inboundSaved,
        effects: [{ type: "ai_turn", flowId: flow.id, stepId: step.id }],
      };
    }
    if (flow && step?.type === "capture") {
      const usedKeyboard = step.field === "phone" || Boolean(step.skippable);
      if (step.skippable && isSkipAnswer(input.event.text)) {
        return toEngineResult(
          withKeyboardCleared(
            executeFrom(
              flow.definition,
              { ...input.session, stepId: step.next, awaitingInput: false, formIndex: undefined },
              contact,
              now,
              input.flows,
            ),
          ),
          inboundSaved,
        );
      }
      try {
        contact = applyCapturedValue(contact, parseCaptureField(step.field), answer);
        const executed = executeFrom(
          flow.definition,
          { ...input.session, stepId: step.next, awaitingInput: false, formIndex: undefined },
          contact,
          now,
          input.flows,
        );
        return toEngineResult(usedKeyboard ? withKeyboardCleared(executed) : executed, inboundSaved);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Please try again.";
        return {
          contact,
          session: input.session,
          replies: [{ text: message, source: "flow" }],
          inboundSaved,
          effects: [],
        };
      }
    }
    if (flow && step?.type === "form") {
      const fields = step.fields.filter((field) => field.field && field.prompt.trim());
      const index = input.session.formIndex ?? 0;
      const currentField = fields[index];
      if (currentField) {
        try {
          contact = applyCapturedValue(contact, parseCaptureField(currentField.field), answer);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Please try again.";
          return {
            contact,
            session: input.session,
            replies: [{ text: message, source: "flow" }],
            inboundSaved,
            effects: [],
          };
        }
        const nextIndex = index + 1;
        if (nextIndex < fields.length) {
          return toEngineResult(
            executeFrom(
              flow.definition,
              { ...input.session, awaitingInput: false, formIndex: nextIndex },
              contact,
              now,
              input.flows,
            ),
            inboundSaved,
          );
        }
        return toEngineResult(
          executeFrom(
            flow.definition,
            { ...input.session, stepId: step.next, awaitingInput: false, formIndex: undefined },
            contact,
            now,
            input.flows,
          ),
          inboundSaved,
        );
      }
    }
  }

  const matched = matchFlowTrigger(input.flows, input.event.text);
  if (matched?.triggerType === "start" && contact.welcomed) {
    return { contact, session: input.session, replies: [], inboundSaved, effects: [] };
  }
  if (matched) {
    const nextContact = matched.triggerType === "start" ? { ...contact, welcomed: true } : contact;
    return toEngineResult(
      executeFrom(matched.definition, startSession(nextContact.id, matched), nextContact, now, input.flows),
      inboundSaved,
      matched.id,
    );
  }

  return { contact, session: input.session, replies: [], inboundSaved, effects: [] };
}
