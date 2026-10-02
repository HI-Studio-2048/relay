import { describe, expect, it } from "vitest";
import { autoTagCandidates, readAutoTags } from "@/lib/auto-tags";

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
});
