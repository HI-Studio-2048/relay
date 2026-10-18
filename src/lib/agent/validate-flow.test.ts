import { describe, expect, it } from "vitest";
import { generatedToDefinition } from "@/lib/ai-flow";
import { EXAMPLE_LEAD_CAPTURE_FLOW } from "@/lib/example-flow";
import type { GeneratedFlow } from "@/lib/ai";
import { validateFlowDefinition } from "@/lib/agent/validate-flow";
import type { FlowDefinition } from "@/lib/types";

const sketch: GeneratedFlow = {
  name: "Guide leads",
  trigger: { type: "keyword_contains", keywords: "guide", public_replies: [] },
  steps: [
    {
      id: "s1",
      type: "message",
      text: "Want the guide?",
      buttons: [{ label: "Yes", next: "s2", url: "" }],
      field: "",
      tag: "",
      minutes: 0,
      next: "",
    },
    { id: "s2", type: "question", text: "Your name?", buttons: [], field: "name", tag: "", minutes: 0, next: "s3" },
    { id: "s3", type: "question", text: "Email?", buttons: [], field: "email", tag: "", minutes: 0, next: "s4" },
    { id: "s4", type: "question", text: "Phone?", buttons: [], field: "phone", tag: "", minutes: 0, next: "s5" },
    { id: "s5", type: "question", text: "Company?", buttons: [], field: "company", tag: "", minutes: 0, next: "s6" },
    { id: "s6", type: "tag", text: "", buttons: [], field: "", tag: "lead", minutes: 0, next: "s7" },
    { id: "s7", type: "end", text: "Thanks — this is a draft until you turn it on.", buttons: [], field: "", tag: "", minutes: 0, next: "" },
  ],
};

describe("validateFlowDefinition", () => {
  it("accepts the sample lead-capture flow and an AI sketch of one", () => {
    expect(validateFlowDefinition(EXAMPLE_LEAD_CAPTURE_FLOW)).toEqual([]);
    const built = generatedToDefinition(sketch);
    expect(validateFlowDefinition(built.definition)).toEqual([]);
    expect(built.definition.steps.filter((step) => step.type === "capture").map((step) => (step.type === "capture" ? step.field : ""))).toEqual([
      "name",
      "email",
      "phone",
      "custom:company",
    ]);
  });

  it("rejects dangling links, duplicate ids, and fields the engine does not know", () => {
    expect(
      validateFlowDefinition({
        startStepId: "a",
        steps: [
          { id: "a", type: "capture", field: "passport", prompt: "Passport?", next: "missing" },
          { id: "a", type: "end" },
        ],
      } as FlowDefinition),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate step id"),
        expect.stringContaining("passport"),
        expect.stringContaining("next must point at a step"),
      ]),
    );
  });

  it("rejects an empty definition", () => {
    expect(validateFlowDefinition({ startStepId: "a", steps: [] })).toEqual(["A flow needs at least one step"]);
  });
});
