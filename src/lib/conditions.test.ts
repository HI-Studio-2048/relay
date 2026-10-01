import { describe, expect, it } from "vitest";
import { canvasToDefinition, definitionToCanvas, engineDefinition, ruleSummary } from "@/lib/flow-canvas";
import { evaluateCondition, evaluateRule, nextFieldValue, processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord, FlowDefinition, FlowStep } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "u1",
  username: null,
  firstName: "Ana",
  lastName: null,
  email: "ana@x.co",
  phone: null,
  customFields: { score: "12", plan: "pro" },
  tags: ["vip"],
  subscriptions: ["news"],
};

type Condition = Extract<FlowStep, { type: "condition" }>;
const condition = (patch: Partial<Condition>): Condition => ({ id: "c", type: "condition", check: "tag", tagName: "vip", nextTrue: "y", nextFalse: "n", ...patch });

describe("conditions", () => {
  it("supports negation and numeric comparisons", () => {
    expect(evaluateRule(contact, { check: "tag", tagName: "vip", op: "not_set" })).toBe(false);
    expect(evaluateRule(contact, { check: "tag", tagName: "churned", op: "not_set" })).toBe(true);
    expect(evaluateRule(contact, { check: "subscription", tagName: "news", op: "not_set" })).toBe(false);
    expect(evaluateRule(contact, { check: "field", field: "custom:score", op: "gt", value: "10" })).toBe(true);
    expect(evaluateRule(contact, { check: "field", field: "custom:score", op: "lt", value: "10" })).toBe(false);
    expect(evaluateRule(contact, { check: "field", field: "custom:plan", op: "gt", value: "1" })).toBe(false);
    expect(evaluateRule(contact, { check: "field", field: "phone", op: "not_set" })).toBe(true);
    expect(evaluateRule(contact, { check: "field", field: "custom:plan", op: "neq", value: "basic" })).toBe(true);
    expect(evaluateRule(contact, { check: "field", field: "email", op: "not_contains", value: "@x.co" })).toBe(false);
  });

  it("combines rules with all / any", () => {
    const extra = [{ check: "field" as const, field: "custom:score" as const, op: "gt" as const, value: "50" }];
    expect(evaluateCondition(contact, condition({ extra }))).toBe(false);
    expect(evaluateCondition(contact, condition({ extra, match: "any" }))).toBe(true);
    expect(evaluateCondition(contact, condition({}))).toBe(true);
  });

  it("round-trips extra rules through the canvas", () => {
    const definition: FlowDefinition = {
      startStepId: "c",
      steps: [
        condition({ op: "not_set", extra: [{ check: "field", field: "custom:score", op: "gt", value: "10" }], match: "any" }),
        { id: "y", type: "end" },
        { id: "n", type: "end" },
      ],
    };
    const back = engineDefinition(canvasToDefinition(definitionToCanvas(definition)));
    expect(back.steps[0]).toEqual(definition.steps[0]);
    expect(ruleSummary({ check: "tag", tagName: "vip", op: "not_set" })).toBe("No #vip");
    expect(ruleSummary({ check: "field", field: "custom:score", op: "gt", value: "10" })).toBe("score > “10”");
  });
});

describe("set field add / subtract", () => {
  it("does number math with blank as zero", () => {
    expect(nextFieldValue("", "5", "add")).toBe("5");
    expect(nextFieldValue("12", "2.5", "subtract")).toBe("9.5");
    expect(nextFieldValue("abc", "1", "add")).toBe("1");
    expect(nextFieldValue("3", "hello", "set")).toBe("hello");
  });

  it("increments a lead score inside a flow", () => {
    const flows: FlowRecord[] = [
      {
        id: "f",
        triggerType: "keyword",
        triggerValue: "price",
        isActive: true,
        definition: { startStepId: "s", steps: [{ id: "s", type: "set_field", field: "custom:score", value: "10", mode: "add", next: "e" }, { id: "e", type: "end" }] },
      },
    ];
    const result = processInboundEvent({ contact, session: null, flows, event: { telegramUserId: "u1", text: "price" } });
    expect(result.contact.customFields.score).toBe("22");
  });
});
