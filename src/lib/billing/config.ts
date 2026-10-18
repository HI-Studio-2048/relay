/**
 * Recatch's own plans and the launch promo. This is the only place those are defined.
 *
 * Prices and the promo can change without a code change, from environment variables
 * (see `.env.example`). Unset means the defaults below: three paid monthly plans, and
 * 50% off the first month of every one of them. There is no free plan and no trial.
 */

export type PlanDefinition = {
  id: string;
  name: string;
  description: string;
  /** Monthly price in cents. Checkout charges this, then the promo coupon if it applies. */
  monthlyCents: number;
  features: string[];
  highlighted: boolean;
};

export type PromoSettings = {
  /** Master switch. `BILLING_PROMO_ENABLED=false` turns the offer off. */
  enabled: boolean;
  /** Percent off the first invoice only. Stripe coupon duration `once`. */
  percentOff: number;
  duration: "once";
  /**
   * Plan ids the offer applies to. Empty means every paid plan.
   * Set `BILLING_PROMO_PLAN_IDS=starter,pro` to narrow it.
   */
  planIds: string[];
};

const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For one brand getting its first flows live.",
    monthlyCents: 4900,
    highlighted: false,
    features: ["Visual flows and keywords", "Shared inbox", "Confirmed broadcasts", "Lead capture, tags and segments"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For a growing mix of channels and an AI assistant.",
    monthlyCents: 9900,
    highlighted: true,
    features: ["Everything in Starter", "AI replies and the flow builder", "Comment to DM and sequences", "Rules, goals and saved replies"],
  },
  {
    id: "business",
    name: "Business",
    description: "For a team running every channel from one login.",
    monthlyCents: 19900,
    highlighted: false,
    features: ["Everything in Pro", "All accounts in one place", "Team assignment and alerts", "API keys and webhooks"],
  },
];

function envOn(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(value)) return true;
  if (["0", "false", "off", "no"].includes(value)) return false;
  return fallback;
}

/** 1–99. Anything else keeps the default so a typo cannot make the first month free. */
function promoPercent(): number {
  const raw = process.env.BILLING_PROMO_PERCENT_OFF?.trim();
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 99) return 50;
  return n;
}

function promoPlanIds(known: Set<string>): string[] {
  const raw = process.env.BILLING_PROMO_PLAN_IDS?.trim() ?? "";
  if (!raw || raw === "*") return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((id) => known.has(id));
}

function monthlyCents(plan: PlanDefinition): number {
  const raw = process.env[`BILLING_PRICE_${plan.id.toUpperCase()}_CENTS`]?.trim();
  if (!raw) return plan.monthlyCents;
  const n = Number(raw);
  // A price under $1 would be an accidental free plan. Ignore it.
  if (!Number.isInteger(n) || n < 100) return plan.monthlyCents;
  return n;
}

export function billingConfig(): { currency: "usd"; plans: PlanDefinition[]; promo: PromoSettings } {
  const plans = PLANS.map((plan) => ({ ...plan, monthlyCents: monthlyCents(plan) }));
  return {
    currency: "usd",
    plans,
    promo: {
      enabled: envOn("BILLING_PROMO_ENABLED", true),
      percentOff: promoPercent(),
      duration: "once",
      planIds: promoPlanIds(new Set(plans.map((plan) => plan.id))),
    },
  };
}

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.PUBLIC_URL?.trim());
}
