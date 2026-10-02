import { describe, expect, it } from "vitest";
import { parseCsatPayload, ratingBody, scoreFromBody } from "@/lib/csat";
import { matchingRules } from "@/lib/rule-types";

describe("CSAT", () => {
  it("parses taps and logged ratings", () => {
    expect(parseCsatPayload("csat:3")).toBe(3);
    expect(parseCsatPayload("csat:9")).toBeNull();
    expect(parseCsatPayload("n:x")).toBeNull();
    expect(scoreFromBody(ratingBody(1))).toBe(1);
    expect(scoreFromBody("hello")).toBeNull();
  });

  it("lets rules react to a specific score", () => {
    const rules = [
      { id: "bad", isActive: true, triggerType: "csat_rated", triggerValue: "1", actionType: "notify_admin", actionValue: "Unhappy customer" },
      { id: "any", isActive: true, triggerType: "csat_rated", triggerValue: "", actionType: "add_tag", actionValue: "rated" },
    ];
    expect(matchingRules(rules, [{ type: "csat_rated", value: "1" }]).map((rule) => rule.id).sort()).toEqual(["any", "bad"]);
    expect(matchingRules(rules, [{ type: "csat_rated", value: "3" }]).map((rule) => rule.id)).toEqual(["any"]);
  });
});
