import { describe, expect, it } from "vitest";
import { allowAutoTagCheck, autoTagCandidates, readAutoTags } from "@/lib/auto-tags";

describe("auto-tags", () => {
  it("keeps only complete rules, trimmed and capped", () => {
    expect(readAutoTags({ autoTags: [{ tag: " vip ", description: " big spender " }, { tag: "x" }, "junk", { tag: "", description: "y" }] })).toEqual([
      { tag: "vip", description: "big spender" },
    ]);
    expect(readAutoTags({})).toEqual([]);
  });

  it("skips commands, tiny messages and tags the contact already has", () => {
    const rules = [
      { tag: "Wholesale", description: "bulk pricing" },
      { tag: "refund", description: "wants money back" },
    ];
    expect(autoTagCandidates(rules, ["wholesale"], "do you do bulk orders?").map((rule) => rule.tag)).toEqual(["refund"]);
    expect(autoTagCandidates(rules, [], "/start")).toEqual([]);
    expect(autoTagCandidates(rules, [], "hi")).toEqual([]);
  });

  it("checks each contact at most once per 10 minutes", () => {
    const t = 1_800_000_000_000;
    expect(allowAutoTagCheck("bot-cd", "c-cd", t)).toBe(true);
    expect(allowAutoTagCheck("bot-cd", "c-cd", t + 60_000)).toBe(false);
    expect(allowAutoTagCheck("bot-cd", "c-cd", t + 11 * 60_000)).toBe(true);
  });
});
