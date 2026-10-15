import { describe, expect, it } from "vitest";
import { AFFILIATE_NAV, AFFILIATE_TERMS, affiliateTermText, affiliateTerms } from "@/lib/affiliates";

describe("affiliate placeholders", () => {
  it("has not published any commercial term", () => {
    expect(AFFILIATE_TERMS.every((term) => term.value == null)).toBe(true);
  });

  it("prints each unpublished term as Label: TBD", () => {
    for (const term of AFFILIATE_TERMS) {
      expect(affiliateTermText(term)).toBe(`${term.label}: TBD`);
    }
  });

  it("keeps commission and signup terms on their own pages, with unique labels", () => {
    expect(affiliateTerms("commission").length).toBeGreaterThan(0);
    expect(affiliateTerms("signup").map((term) => term.key)).toEqual(
      expect.arrayContaining(["signupUrl", "approval", "eligibility", "agreement"]),
    );
    const labels = AFFILIATE_TERMS.map((term) => term.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("links the four public pages", () => {
    expect(AFFILIATE_NAV.map((item) => item.href)).toEqual([
      "/affiliates",
      "/affiliates/commission",
      "/affiliates/signup",
      "/affiliates/promote",
    ]);
  });
});
