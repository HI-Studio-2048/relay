import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flowEvents, flows } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import type { FlowDefinition } from "@/lib/types";

export type FlowEventKind = "start" | "sent" | "click" | "complete";

export type FlowEventInput = {
  botId: string;
  flowId: string;
  stepId?: string | null;
  contactId?: string | null;
  kind: FlowEventKind;
};

/** Best effort: analytics never block or fail a conversation. */
export async function recordFlowEvents(events: FlowEventInput[]) {
  if (events.length === 0) return;
  try {
    const db = await getDb();
    await db.insert(flowEvents).values(
      events.map((event) => ({
        id: crypto.randomUUID(),
        botId: event.botId,
        flowId: event.flowId,
        stepId: event.stepId ?? null,
        contactId: event.contactId ?? null,
        kind: event.kind,
      })),
    );
  } catch (error) {
    log.warn("Analytics write failed", error instanceof Error ? error.message : error);
  }
}

/** The step that drew the button whose callback leads to `nextStepId`. */
export function buttonSourceStep(definition: FlowDefinition, nextStepId: string) {
  for (const step of definition.steps) {
    if (step.type !== "text") continue;
    if ((step.buttons ?? []).some((button) => button.next === nextStepId)) return step.id;
    if ((step.quickReplies ?? []).some((reply) => reply.next === nextStepId)) return step.id;
  }
  return null;
}

export type FlowStats = {
  runs: number;
  people: number;
  sent: number;
  clicks: number;
  completed: number;
  /** Clicks per message that carried buttons, 0–1. */
  ctr: number;
  completionRate: number;
};

const EMPTY: FlowStats = { runs: 0, people: 0, sent: 0, clicks: 0, completed: 0, ctr: 0, completionRate: 0 };

type Row = { flowId: string; stepId: string | null; kind: string; count: number; people: number };

function summarize(rows: Row[], buttonSteps: Set<string>): FlowStats {
  const total = (kind: string) => rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.count, 0);
  const runs = total("start");
  const sentWithButtons = rows
    .filter((row) => row.kind === "sent" && row.stepId && buttonSteps.has(row.stepId))
    .reduce((sum, row) => sum + row.count, 0);
  const clicks = total("click");
  const completed = total("complete");
  return {
    runs,
    people: Math.max(0, ...rows.filter((row) => row.kind === "start").map((row) => row.people)),
    sent: total("sent"),
    clicks,
    completed,
    ctr: sentWithButtons ? Math.min(1, clicks / sentWithButtons) : 0,
    completionRate: runs ? Math.min(1, completed / runs) : 0,
  };
}

function buttonStepIds(definition: FlowDefinition) {
  return new Set(
    definition.steps
      .filter((step) => step.type === "text" && ((step.buttons ?? []).some((b) => !b.url) || (step.quickReplies ?? []).length > 0))
      .map((step) => step.id),
  );
}

async function groupedRows(filter: ReturnType<typeof and>, byStep: boolean): Promise<Row[]> {
  const db = await getDb();
  const rows = await db
    .select({
      flowId: flowEvents.flowId,
      stepId: byStep ? flowEvents.stepId : sql<string | null>`null`,
      kind: flowEvents.kind,
      count: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${flowEvents.contactId})::int`,
    })
    .from(flowEvents)
    .where(filter)
    .groupBy(flowEvents.flowId, ...(byStep ? [flowEvents.stepId] : []), flowEvents.kind);
  return rows.map((row) => ({ ...row, count: Number(row.count), people: Number(row.people) }));
}

/** Per-flow totals for the Flows list (optionally only the last `days`). */
export async function statsByFlow(botId: string, days?: number): Promise<Record<string, FlowStats>> {
  const db = await getDb();
  const filters = [eq(flowEvents.botId, botId)];
  if (days) filters.push(gte(flowEvents.createdAt, new Date(Date.now() - days * 86_400_000)));
  const [rows, defs] = await Promise.all([
    groupedRows(and(...filters), true),
    db.select({ id: flows.id, definition: flows.definition }).from(flows).where(eq(flows.botId, botId)),
  ]);
  const peopleRows = await groupedRows(and(...filters), false);
  const result: Record<string, FlowStats> = {};
  for (const def of defs) {
    const own = rows.filter((row) => row.flowId === def.id);
    const stats = own.length ? summarize(own, buttonStepIds(def.definition as FlowDefinition)) : { ...EMPTY };
    stats.people = peopleRows.find((row) => row.flowId === def.id && row.kind === "start")?.people ?? 0;
    result[def.id] = stats;
  }
  return result;
}

export type StepStats = Record<string, { sent: number; clicks: number; ctr: number }>;

/** Per-step sent / click counts, keyed by step id, for the canvas overlay. */
export async function statsByStep(flowId: string): Promise<{ flow: FlowStats; steps: StepStats }> {
  const db = await getDb();
  const [def] = await db.select({ definition: flows.definition }).from(flows).where(eq(flows.id, flowId)).limit(1);
  const definition = (def?.definition ?? { startStepId: "", steps: [] }) as FlowDefinition;
  const rows = await groupedRows(eq(flowEvents.flowId, flowId), true);
  const peopleRows = await groupedRows(eq(flowEvents.flowId, flowId), false);
  const flowStats = rows.length ? summarize(rows, buttonStepIds(definition)) : { ...EMPTY };
  flowStats.people = peopleRows.find((row) => row.kind === "start")?.people ?? 0;
  const steps: StepStats = {};
  for (const row of rows) {
    if (!row.stepId || (row.kind !== "sent" && row.kind !== "click")) continue;
    const entry = (steps[row.stepId] ??= { sent: 0, clicks: 0, ctr: 0 });
    if (row.kind === "sent") entry.sent += row.count;
    else entry.clicks += row.count;
  }
  for (const entry of Object.values(steps)) entry.ctr = entry.sent ? Math.min(1, entry.clicks / entry.sent) : 0;
  return { flow: flowStats, steps };
}
