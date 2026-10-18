import { billingConfig, type PlanDefinition, type PromoSettings } from "@/lib/billing/config";

export type PlanQuote = {
  plan: PlanDefinition;
  promoApplied: boolean;
  percentOff: number;
  regularCents: number;
  /** What the first invoice charges. Equals the regular price when the promo is off. */
  dueTodayCents: number;
  /** What each later month costs. */
  renewalCents: number;
  firstPeriodLabel: "first month" | null;
  currency: "usd";
};

/** What the plans section and the signup form render. Strings only, so a client component can take it. */
export type PlanCard = {
  id: string;
  name: string;
  description: string;
  features: string[];
  highlighted: boolean;
  promoApplied: boolean;
  percentOff: number;
  regularLabel: string;
  dueTodayLabel: string;
  renewalLabel: string;
  firstPeriodLabel: "first month" | null;
};

export function promoApplies(planId: string, promo: PromoSettings): boolean {
  if (!promo.enabled || promo.percentOff <= 0) return false;
  if (promo.planIds.length === 0) return true;
  return promo.planIds.includes(planId);
}

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function quotePlan(planId: string, config = billingConfig()): PlanQuote | null {
  const plan = config.plans.find((item) => item.id === planId);
  if (!plan) return null;
  const applied = promoApplies(plan.id, config.promo);
  const dueTodayCents = applied ? Math.round((plan.monthlyCents * (100 - config.promo.percentOff)) / 100) : plan.monthlyCents;
  return {
    plan,
    promoApplied: applied,
    percentOff: applied ? config.promo.percentOff : 0,
    regularCents: plan.monthlyCents,
    dueTodayCents,
    renewalCents: plan.monthlyCents,
    firstPeriodLabel: applied ? "first month" : null,
    currency: config.currency,
  };
}

export function listQuotes(config = billingConfig()): PlanQuote[] {
  return config.plans.map((plan) => quotePlan(plan.id, config)!);
}

export function toPlanCard(quote: PlanQuote): PlanCard {
  return {
    id: quote.plan.id,
    name: quote.plan.name,
    description: quote.plan.description,
    features: quote.plan.features,
    highlighted: quote.plan.highlighted,
    promoApplied: quote.promoApplied,
    percentOff: quote.percentOff,
    regularLabel: formatMoney(quote.regularCents),
    dueTodayLabel: formatMoney(quote.dueTodayCents),
    renewalLabel: formatMoney(quote.renewalCents),
    firstPeriodLabel: quote.firstPeriodLabel,
  };
}

export function planCards(config = billingConfig()): PlanCard[] {
  return listQuotes(config).map(toPlanCard);
}

export function getPlan(planId: string | null | undefined, config = billingConfig()): PlanDefinition | null {
  if (!planId) return null;
  return config.plans.find((plan) => plan.id === planId) ?? null;
}
