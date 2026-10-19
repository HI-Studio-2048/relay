import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { billingPayments } from "@/lib/db/schema";

export type BillingPaymentInput = {
  userId: string;
  invoiceId: string | null;
  checkoutSessionId: string | null;
  subscriptionId: string | null;
  /** What Stripe charged, in minor units. Never used to choose a plan. */
  amountCents: number | null;
  currency: string | null;
  /**
   * Stripe `billing_reason`. Checkout and the first invoice both use
   * `subscription_create` so they share one row.
   */
  billingReason: string;
};

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === "23505") return true;
    const message = current instanceof Error ? current.message : "";
    if (/duplicate key|unique constraint/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Record one subscription charge. The Checkout session and `invoice.paid` for
 * `billing_reason=subscription_create` are the same first payment: the invoice id
 * (and, if that is missing, the subscription) is the key, so whichever event
 * arrives second does not add a row. A later invoice (`subscription_cycle`, …)
 * is a new id and a new row. Stripe retries hit the same unique key.
 */
export async function recordBillingPayment(input: BillingPaymentInput): Promise<"recorded" | "duplicate" | "skipped"> {
  if (!input.invoiceId && !input.checkoutSessionId) return "skipped";
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      if (input.invoiceId) {
        const [byInvoice] = await tx
          .select({ id: billingPayments.id, checkoutSessionId: billingPayments.checkoutSessionId })
          .from(billingPayments)
          .where(eq(billingPayments.invoiceId, input.invoiceId))
          .limit(1);
        if (byInvoice) {
          if (input.checkoutSessionId && !byInvoice.checkoutSessionId) {
            await tx.update(billingPayments).set({ checkoutSessionId: input.checkoutSessionId }).where(eq(billingPayments.id, byInvoice.id));
          }
          return "duplicate";
        }
      }
      if (input.subscriptionId && input.billingReason === "subscription_create") {
        const [first] = await tx
          .select({
            id: billingPayments.id,
            invoiceId: billingPayments.invoiceId,
            checkoutSessionId: billingPayments.checkoutSessionId,
          })
          .from(billingPayments)
          .where(
            and(
              eq(billingPayments.userId, input.userId),
              eq(billingPayments.subscriptionId, input.subscriptionId),
              eq(billingPayments.billingReason, "subscription_create"),
            ),
          )
          .limit(1);
        if (first) {
          await tx
            .update(billingPayments)
            .set({
              invoiceId: first.invoiceId ?? input.invoiceId,
              checkoutSessionId: first.checkoutSessionId ?? input.checkoutSessionId,
            })
            .where(eq(billingPayments.id, first.id));
          return "duplicate";
        }
      }
      await tx.insert(billingPayments).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        invoiceId: input.invoiceId,
        checkoutSessionId: input.checkoutSessionId,
        subscriptionId: input.subscriptionId,
        amountCents: input.amountCents,
        currency: input.currency,
        billingReason: input.billingReason,
      });
      return "recorded";
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}
