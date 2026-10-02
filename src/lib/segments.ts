/**
 * Audience segments (ManyChat "conditions" on broadcasts and filters on Contacts).
 * Pure and browser safe: the compose page previews counts with the same matcher the worker uses.
 */
export type SegmentCondition =
  | { kind: "tag"; op: "has" | "not"; value: string }
  | { kind: "field"; key: string; op: "eq" | "contains" | "set" | "not_set"; value?: string }
  | { kind: "platform"; op: "is" | "not"; value: string }
  | { kind: "list"; op: "in" | "not"; value: string }
  /** Last message from the contact within N hours (Meta's 24-hour window is the common use). */
  | { kind: "active"; op: "within" | "not_within"; hours: number }
  /** Contact created within N days. */
  | { kind: "joined"; op: "within" | "not_within"; days: number };

export type Segment = { match: "all" | "any"; conditions: SegmentCondition[] };

export const EMPTY_SEGMENT: Segment = { match: "all", conditions: [] };

/** The contact facts a segment can look at. */
export type SegmentSubject = {
  tags: string[];
  email: string | null;
  phone: string | null;
  firstName?: string | null;
  lastName?: string | null;
  customFields: Record<string, string>;
  subscriptions?: string[];
  platform?: string | null;
  createdAt?: string | Date | null;
  lastInboundAt?: string | Date | null;
};

const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

function fieldValue(subject: SegmentSubject, key: string) {
  if (key === "email") return subject.email ?? "";
  if (key === "phone") return subject.phone ?? "";
  if (key === "first_name") return subject.firstName ?? "";
  if (key === "last_name") return subject.lastName ?? "";
  return subject.customFields[key] ?? "";
}

function within(timestamp: string | Date | null | undefined, ms: number, now: number) {
  if (!timestamp) return false;
  return now - new Date(timestamp).getTime() <= ms;
}

export function matchesCondition(subject: SegmentSubject, condition: SegmentCondition, now = Date.now()): boolean {
  switch (condition.kind) {
    case "tag": {
      const has = subject.tags.some((tag) => lower(tag) === lower(condition.value));
      return condition.op === "has" ? has : !has;
    }
    case "field": {
      const actual = lower(fieldValue(subject, condition.key));
      if (condition.op === "set") return actual.length > 0;
      if (condition.op === "not_set") return actual.length === 0;
      const expected = lower(condition.value);
      if (!expected) return false;
      return condition.op === "eq" ? actual === expected : actual.includes(expected);
    }
    case "platform": {
      const same = lower(subject.platform) === lower(condition.value);
      return condition.op === "is" ? same : !same;
    }
    case "list": {
      const member = (subject.subscriptions ?? []).some((list) => lower(list) === lower(condition.value));
      return condition.op === "in" ? member : !member;
    }
    case "active": {
      const yes = within(subject.lastInboundAt, Math.max(0, condition.hours) * 3_600_000, now);
      return condition.op === "within" ? yes : !yes;
    }
    case "joined": {
      const yes = within(subject.createdAt, Math.max(0, condition.days) * 86_400_000, now);
      return condition.op === "within" ? yes : !yes;
    }
  }
}

/** An empty segment matches everyone. */
export function matchesSegment(subject: SegmentSubject, segment: Segment | null | undefined, now = Date.now()): boolean {
  const conditions = segment?.conditions ?? [];
  if (conditions.length === 0) return true;
  return segment!.match === "any"
    ? conditions.some((condition) => matchesCondition(subject, condition, now))
    : conditions.every((condition) => matchesCondition(subject, condition, now));
}

/** Drop malformed conditions from untrusted JSON. */
export function sanitizeSegment(raw: unknown): Segment {
  const input = (raw ?? {}) as { match?: unknown; conditions?: unknown };
  const conditions = Array.isArray(input.conditions) ? input.conditions : [];
  const clean: SegmentCondition[] = [];
  for (const item of conditions.slice(0, 20) as Record<string, unknown>[]) {
    const kind = item?.kind;
    const op = String(item?.op ?? "");
    const value = typeof item?.value === "string" ? item.value.trim() : "";
    if (kind === "tag" && (op === "has" || op === "not") && value) clean.push({ kind, op, value });
    else if (kind === "field" && ["eq", "contains", "set", "not_set"].includes(op) && typeof item.key === "string" && item.key.trim())
      clean.push({ kind, key: item.key.trim(), op: op as "eq", ...(value ? { value } : {}) });
    else if (kind === "platform" && (op === "is" || op === "not") && value) clean.push({ kind, op, value });
    else if (kind === "list" && (op === "in" || op === "not") && value) clean.push({ kind, op, value });
    else if (kind === "active" && (op === "within" || op === "not_within") && Number(item.hours) > 0)
      clean.push({ kind, op, hours: Math.min(24 * 365, Number(item.hours)) });
    else if (kind === "joined" && (op === "within" || op === "not_within") && Number(item.days) > 0)
      clean.push({ kind, op, days: Math.min(3650, Number(item.days)) });
  }
  return { match: input.match === "any" ? "any" : "all", conditions: clean };
}

export function describeCondition(condition: SegmentCondition): string {
  switch (condition.kind) {
    case "tag":
      return condition.op === "has" ? `tagged ${condition.value}` : `not tagged ${condition.value}`;
    case "field":
      if (condition.op === "set") return `${condition.key} is set`;
      if (condition.op === "not_set") return `${condition.key} is empty`;
      return `${condition.key} ${condition.op === "eq" ? "is" : "contains"} "${condition.value ?? ""}"`;
    case "platform":
      return `${condition.op === "is" ? "on" : "not on"} ${condition.value}`;
    case "list":
      return `${condition.op === "in" ? "subscribed to" : "not subscribed to"} ${condition.value}`;
    case "active":
      return `${condition.op === "within" ? "messaged in" : "quiet for"} the last ${condition.hours}h`;
    case "joined":
      return `${condition.op === "within" ? "joined in" : "joined before"} the last ${condition.days} days`;
  }
}

export type SavedSegment = { id: string; name: string; segment: Segment };

/** Named audiences stored on bots.settings.segments, reusable in Contacts and Broadcasts. */
export function readSavedSegments(settings: Record<string, unknown> | null | undefined): SavedSegment[] {
  const raw = Array.isArray(settings?.segments) ? (settings!.segments as Record<string, unknown>[]) : [];
  return raw
    .filter((item) => typeof item?.id === "string" && typeof item?.name === "string")
    .map((item) => ({ id: item.id as string, name: (item.name as string).slice(0, 60), segment: sanitizeSegment(item.segment) }))
    .filter((item) => item.segment.conditions.length > 0);
}
