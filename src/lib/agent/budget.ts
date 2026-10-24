import { and, eq, sql } from "drizzle-orm";
import type { AgentUsage } from "@/lib/agent/pricing";
import { getDb } from "@/lib/db";
import { assistantUsage } from "@/lib/db/schema";

/**
 * The Overview assistant runs on the company's Claude key, so every login gets a monthly allowance:
 * ASSISTANT_MONTHLY_BUDGET_USD, $5 when unset, and 0 turns the assistant off on the server key. Each
 * model call is priced (agent/pricing.ts) and added to that login's row for the UTC month. A login
 * whose account saved an OpenRouter key pays for itself and is never counted here.
 */
export const DEFAULT_ASSISTANT_BUDGET_USD = 5;

export function assistantMonthlyBudgetUsd() {
  const raw = process.env.ASSISTANT_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_ASSISTANT_BUDGET_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_ASSISTANT_BUDGET_USD;
}

/** The UTC month a call is billed to, as YYYY-MM. */
export function usagePeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export type AssistantBudget = {
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  /** When the allowance starts over: the first of next month, UTC. */
  resetsAt: string;
  exhausted: boolean;
};

export async function readAssistantBudget(ownerId: string, now = new Date()): Promise<AssistantBudget> {
  const db = await getDb();
  const [row] = await db
    .select({ costMicros: assistantUsage.costMicros })
    .from(assistantUsage)
    .where(and(eq(assistantUsage.ownerId, ownerId), eq(assistantUsage.period, usagePeriod(now))))
    .limit(1);
  const limitMicros = Math.round(assistantMonthlyBudgetUsd() * 1_000_000);
  const spentMicros = Number(row?.costMicros ?? 0);
  return {
    limitUsd: limitMicros / 1_000_000,
    spentUsd: spentMicros / 1_000_000,
    remainingUsd: Math.max(0, limitMicros - spentMicros) / 1_000_000,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    exhausted: spentMicros >= limitMicros,
  };
}

/** Add one model call to the login's month. Concurrent calls are safe: the database does the sum. */
export async function recordAssistantUsage(ownerId: string, usage: AgentUsage, now = new Date()) {
  const db = await getDb();
  await db
    .insert(assistantUsage)
    .values({
      ownerId,
      period: usagePeriod(now),
      costMicros: usage.costMicros,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      requests: 1,
    })
    .onConflictDoUpdate({
      target: [assistantUsage.ownerId, assistantUsage.period],
      set: {
        costMicros: sql`${assistantUsage.costMicros} + excluded.cost_micros`,
        inputTokens: sql`${assistantUsage.inputTokens} + excluded.input_tokens`,
        outputTokens: sql`${assistantUsage.outputTokens} + excluded.output_tokens`,
        requests: sql`${assistantUsage.requests} + 1`,
        updatedAt: sql`now()`,
      },
    });
}

/** "November 1", for telling someone when the allowance comes back. */
export function formatResetDate(resetsAt: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(resetsAt));
}

/** The message shown once the month's allowance is used up. */
export function budgetExhaustedMessage(budget: AssistantBudget) {
  return `You've used this month's assistant allowance ($${budget.limitUsd.toFixed(2)}). It comes back on ${formatResetDate(budget.resetsAt)}. Anything I saved is still in your drafts, and you can keep going sooner by saving your own OpenRouter key on the AI assistant page.`;
}
