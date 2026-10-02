import { describe, expect, it } from "vitest";
import { canvasToDefinition, definitionToCanvas, engineDefinition, validateCanvas } from "@/lib/flow-canvas";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { FLOW_TEMPLATES, findTemplate } from "@/lib/flow-templates";
import type { ContactRecord } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "u1",
  username: null,
  firstName: "Ana",
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags: [],
};

describe("flow templates", () => {
  for (const template of FLOW_TEMPLATES) {
    it(`${template.id} survives the canvas and has no errors`, () => {
      const graph = definitionToCanvas(template.definition);
      expect(validateCanvas(graph).errors).toEqual([]);
      const back = engineDefinition(canvasToDefinition(graph));
      expect(back.startStepId).toBe(template.definition.startStepId);
      expect(back.steps.map((step) => step.id).sort()).toEqual(template.definition.steps.map((step) => step.id).sort());
    });
  }

  it("lead-score quiz sends hot leads to booking", () => {
    const template = findTemplate("lead-score-quiz")!;
    const flows: FlowRecord[] = [{ id: "quiz", triggerType: template.triggerType, triggerValue: template.triggerValue, isActive: true, definition: template.definition }];
    let state = processInboundEvent({ contact, session: null, flows, event: { telegramUserId: "u1", text: "is this right for me?" } });
    for (const text of ["10+", "This week", "ana@example.com"]) {
      state = processInboundEvent({ contact: state.contact, session: state.session, flows, event: { telegramUserId: "u1", text } });
    }
    expect(state.contact.customFields.score).toBe("7");
    expect(state.contact.tags).toContain("hot-lead");
    expect(state.replies.at(-1)?.buttons?.[0]?.text).toBe("Book a call");
  });
});
