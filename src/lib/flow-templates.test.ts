import { describe, expect, it } from "vitest";
import { canvasToDefinition, definitionToCanvas } from "@/lib/flow-canvas";
import { processInboundEvent } from "@/lib/flow-engine";
import { FLOW_TEMPLATES } from "@/lib/flow-templates";
import type { FlowStep } from "@/lib/types";

function targets(step: FlowStep): string[] {
  const out: string[] = [];
  if ("next" in step && step.next) out.push(step.next);
  if (step.type === "text") {
    for (const button of step.buttons ?? []) if (button.next) out.push(button.next);
    for (const reply of step.quickReplies ?? []) if (reply.next) out.push(reply.next);
  }
  if (step.type === "condition") out.push(step.nextTrue, step.nextFalse);
  return out;
}

describe("flow templates", () => {
  it.each(FLOW_TEMPLATES.map((template) => [template.id, template] as const))("%s is wired correctly", (_id, template) => {
    const ids = new Set(template.definition.steps.map((step) => step.id));
    expect(ids.size).toBe(template.definition.steps.length);
    expect(ids.has(template.definition.startStepId)).toBe(true);
    for (const step of template.definition.steps) for (const target of targets(step)) expect(ids).toContain(target);
  });

  it.each(FLOW_TEMPLATES.map((template) => [template.id, template] as const))("%s survives the canvas", (_id, template) => {
    const back = canvasToDefinition(definitionToCanvas(template.definition));
    expect(back.steps.length).toBeGreaterThan(0);
  });

  it("runs the comment lead magnet end to end", () => {
    const template = FLOW_TEMPLATES.find((item) => item.id === "comment-lead-magnet")!;
    const flow = { id: "t", triggerType: template.triggerType, triggerValue: template.triggerValue, isActive: true, definition: template.definition };
    const first = processInboundEvent({
      contact: null,
      session: null,
      flows: [flow],
      event: { telegramUserId: "u", firstName: "Ada", text: "GUIDE pls", kind: "comment", postId: "p" },
    });
    expect(first.publicReply).toBeTruthy();
    expect(first.replies[0]?.buttons?.[0]?.data).toBe("n:ask");
    const tap = processInboundEvent({ contact: first.contact, session: first.session, flows: [flow], event: { telegramUserId: "u", callbackData: "n:ask" } });
    expect(tap.replies[0]?.text).toContain("email");
    const email = processInboundEvent({ contact: tap.contact, session: tap.session, flows: [flow], event: { telegramUserId: "u", text: "ada@example.com" } });
    expect(email.contact.email).toBe("ada@example.com");
    expect(email.contact.tags).toContain("lead-magnet");
    expect(email.replies.at(-1)?.text).toContain("https://example.com/guide");
    expect(email.completedFlowIds).toEqual(["t"]);
  });
});
