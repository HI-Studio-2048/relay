import type { Metadata } from "next";

/**
 * Commercial terms for the public affiliate pages.
 *
 * The repo has no affiliate program: no rates, payout rules, cookie window,
 * agreement, or application URL. Leave `value` null until those are decided.
 * A null value renders as "Label: TBD" and must stay that way rather than
 * being filled with a guess.
 */
export type AffiliateTerm = {
  key: string;
  /** Words in front of ": TBD" while `value` is null. */
  label: string;
  page: "commission" | "signup";
  /** The published term, or null when it is still TBD. */
  value: string | null;
};

export const AFFILIATE_TERMS: readonly AffiliateTerm[] = [
  { key: "commissionRate", label: "Commission", page: "commission", value: null },
  { key: "commissionBasis", label: "What commission is paid on", page: "commission", value: null },
  { key: "cookieWindow", label: "Cookie window", page: "commission", value: null },
  { key: "qualifyingSale", label: "What counts as a qualifying sale", page: "commission", value: null },
  { key: "payoutSchedule", label: "Payout schedule", page: "commission", value: null },
  { key: "payoutMinimum", label: "Minimum payout", page: "commission", value: null },
  { key: "payoutMethod", label: "Payout method", page: "commission", value: null },
  { key: "payoutCurrency", label: "Payout currency", page: "commission", value: null },
  { key: "refunds", label: "Refunds and clawbacks", page: "commission", value: null },
  { key: "selfReferral", label: "Self-referrals", page: "commission", value: null },
  { key: "signupUrl", label: "Signup URL", page: "signup", value: null },
  { key: "approval", label: "Approval", page: "signup", value: null },
  { key: "eligibility", label: "Who can join", page: "signup", value: null },
  { key: "agreement", label: "Affiliate agreement", page: "signup", value: null },
];

export const AFFILIATE_NAV = [
  { href: "/affiliates", label: "How it works" },
  { href: "/affiliates/commission", label: "Commission" },
  { href: "/affiliates/signup", label: "Sign up" },
  { href: "/affiliates/promote", label: "Promote" },
] as const;

export function affiliateTerms(page: AffiliateTerm["page"]) {
  return AFFILIATE_TERMS.filter((term) => term.page === page);
}

export function affiliateTerm(key: string) {
  const term = AFFILIATE_TERMS.find((item) => item.key === key);
  if (!term) throw new Error(`Unknown affiliate term: ${key}`);
  return term;
}

/** Visible line for a term. Unpublished terms stay in the form "Commission: TBD". */
export function affiliateTermText(term: AffiliateTerm) {
  return term.value ?? `${term.label}: TBD`;
}

export function affiliateMetadata(input: { title: string; description: string; path: string }): Metadata {
  const title = `${input.title} · Recatch`;
  const url = `https://recatch.app${input.path}`;
  return {
    title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: input.description,
      url,
      siteName: "Recatch",
      type: "website",
      locale: "en_US",
    },
  };
}
