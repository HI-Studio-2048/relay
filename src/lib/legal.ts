/** Who runs Relay, for the privacy policy, terms and data deletion pages. */
export const LEGAL = {
  company: "HI Studio",
  product: "Relay",
  updated: "9 October 2026",
};

/** Public contact for privacy and deletion requests. Platform reviewers (Meta, Google, TikTok) check it exists. */
export function legalContactEmail(): string | null {
  return process.env.PUBLIC_CONTACT_EMAIL?.trim() || null;
}
