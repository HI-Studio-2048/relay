import { describe, expect, it } from "vitest";
import { canvasToDefinition, definitionToCanvas } from "@/lib/flow-canvas";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { effectiveValidation, validateAnswer } from "@/lib/lead-capture";
import type { ContactRecord, FlowDefinition, FlowSessionState } from "@/lib/types";

describe("validateAnswer", () => {
  it("normalizes numbers and rejects words", () => {
    expect(validateAnswer("number", " 42 ")).toBe("42");
    expect(validateAnswer("number", "3,5")).toBe("3.5");
    expect(validateAnswer("number", "1,234,567")).toBe("1234567");
    expect(validateAnswer("number", "-0.25")).toBe("-0.25");
    expect(validateAnswer("number", "about 10")).toBeNull();
  });

  it("lowercases email and rejects malformed ones", () => {
    expect(validateAnswer("email", "Dan@Example.COM")).toBe("dan@example.com");
    expect(validateAnswer("email", "dan@example")).toBeNull();
  });

  it("keeps phone digits with a leading +", () => {
    expect(validateAnswer("phone", "+1 (555) 123-4567")).toBe("+15551234567");
    expect(validateAnswer("phone", "15551212")).toBe("15551212");
    expect(validateAnswer("phone", "call me")).toBeNull();
    expect(validateAnswer("phone", "12345")).toBeNull();
  });

  it("adds https to bare domains and rejects non-links", () => {
    expect(validateAnswer("url", "example.com/pricing")).toBe("https://example.com/pricing");
    expect(validateAnswer("url", "http://shop.test")).toBe("http://shop.test/");
    expect(validateAnswer("url", "localhost")).toBeNull();
    expect(validateAnswer("url", "ftp://example.com")).toBeNull();
    expect(validateAnswer("url", "not a link")).toBeNull();
  });

  it("reads ISO, day-first, and written dates as YYYY-MM-DD", () => {
    expect(validateAnswer("date", "2026-10-06")).toBe("2026-10-06");
    expect(validateAnswer("date", "06/10/2026")).toBe("2026-10-06");
    expect(validateAnswer("date", "6.10.2026")).toBe("2026-10-06");
    expect(validateAnswer("date", "October 6 2026")).toBe("2026-10-06");
    expect(validateAnswer("date", "31/02/2026")).toBeNull();
    expect(validateAnswer("date", "tomorrow")).toBeNull();
  });

  it("checks email and phone fields even without a reply type", () => {
    expect(effectiveValidation("email", undefined)).toBe("email");
    expect(effectiveValidation("phone", "text")).toBe("phone");
    expect(effectiveValidation("custom:budget", "number")).toBe("number");
    expect(effectiveValidation("custom:budget", undefined)).toBe("text");
  });
});

const definition: FlowDefinition = {
  startStepId: "ask",
  steps: [
    {
      id: "ask",
      type: "capture",
      field: "custom:budget",
      prompt: "What is your budget?",
      validation: "number",
      retryText: "Just the number, please.",
      skippable: true,
      next: "done",
    },
    { id: "done", type: "text", text: "Thanks!" },
  ],
};

describe("User Input reply type in the engine", () => {
  const flows: FlowRecord[] = [
    { id: "f1", triggerType: "keyword", triggerValue: "budget", isActive: true, definition },
  ];

  const start = () => {
    const state: { contact: ContactRecord | null; session: FlowSessionState | null } = { contact: null, session: null };
    const run = (text: string) => {
      const result = processInboundEvent({
        contact: state.contact,
        session: state.session,
        flows,
        event: { telegramUserId: "1001", text },
      });
      state.contact = result.contact;
      state.session = result.session;
      return result;
    };
    return { state, run };
  };

  it("sends the retry message, keeps the Skip button, and waits on an invalid answer", () => {
    const { state, run } = start();
    run("budget");
    const retry = run("a lot");
    expect(retry.replies).toHaveLength(1);
    expect(retry.replies[0]?.text).toBe("Just the number, please.");
    expect(retry.replies[0]?.keyboard).toEqual(["Skip"]);
    expect(state.session?.stepId).toBe("ask");
    expect(state.session?.awaitingInput).toBe(true);
    expect(state.contact?.customFields.budget).toBeUndefined();

    const done = run("2,500");
    expect(state.contact?.customFields.budget).toBe("2500");
    expect(done.replies.at(-1)?.text).toBe("Thanks!");
    expect(state.session).toBeNull();
  });

  it("still lets the contact skip", () => {
    const { state, run } = start();
    run("budget");
    const skipped = run("Skip");
    expect(skipped.replies.at(-1)?.text).toBe("Thanks!");
    expect(state.contact?.customFields.budget).toBeUndefined();
  });

  it("survives a canvas round-trip", () => {
    const back = canvasToDefinition(definitionToCanvas(definition));
    const ask = back.steps.find((step) => step.id === "ask");
    expect(ask).toMatchObject({ validation: "number", retryText: "Just the number, please.", skippable: true });
  });
});
