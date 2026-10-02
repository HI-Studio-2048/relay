import { describe, expect, it } from "vitest";
import { EXAMPLE_LEAD_CAPTURE_FLOW } from "@/lib/example-flow";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { applyCapturedValue } from "@/lib/lead-capture";
import type { ContactRecord, FlowSessionState } from "@/lib/types";

const emptyContact = (): ContactRecord => ({
  id: "c1",
  telegramUserId: "1001",
  username: "daniel",
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags: [],
});

const leadFlow = (): FlowRecord => ({
  id: "flow-lead",
  triggerType: "start",
  triggerValue: null,
  isActive: true,
  definition: EXAMPLE_LEAD_CAPTURE_FLOW,
});

describe("applyCapturedValue", () => {
  it("splits a full name and writes email, phone, and custom fields", () => {
    let contact = emptyContact();
    contact = applyCapturedValue(contact, "name", "Daniel Philip");
    contact = applyCapturedValue(contact, "email", "daniel@histudio.test");
    contact = applyCapturedValue(contact, "phone", "+15551212");
    contact = applyCapturedValue(contact, "custom:company", "HI Studio");
    expect(contact.firstName).toBe("Daniel");
    expect(contact.lastName).toBe("Philip");
    expect(contact.email).toBe("daniel@histudio.test");
    expect(contact.phone).toBe("+15551212");
    expect(contact.customFields.company).toBe("HI Studio");
  });

  it("rejects an invalid email", () => {
    expect(() => applyCapturedValue(emptyContact(), "email", "not-an-email")).toThrow(
      /email/i,
    );
  });
});

describe("lead capture flow", () => {
  it("walks /start through name, email, phone, company and tags the contact", () => {
    const flows = [leadFlow()];
    const state: { contact: ContactRecord | null; session: FlowSessionState | null } = {
      contact: null,
      session: null,
    };

    const run = (event: Parameters<typeof processInboundEvent>[0]["event"]) => {
      const result = processInboundEvent({
        contact: state.contact,
        session: state.session,
        flows,
        event,
      });
      state.contact = result.contact;
      state.session = result.session;
      return result;
    };

    const start = run({
      telegramUserId: "1001",
      username: "daniel",
      firstName: "D",
      text: "/start",
    });
    expect(start.replies[0]?.text).toMatch(/HI Studio/);
    expect(start.replies[0]?.buttons?.map((b) => b.text)).toContain("Yes, let's go");

    const afterYes = run({ telegramUserId: "1001", callbackData: "n:intro_media" });
    expect(afterYes.replies[0]?.media?.kind).toBe("animation");
    expect(afterYes.replies.some((reply) => /name/i.test(reply.text))).toBe(true);
    run({ telegramUserId: "1001", text: "Daniel Philip" });
    run({ telegramUserId: "1001", text: "daniel@histudio.test" });
    run({ telegramUserId: "1001", text: "+15551212" });
    const finished = run({ telegramUserId: "1001", text: "HI Studio" });

    expect(state.contact?.firstName).toBe("Daniel");
    expect(state.contact?.lastName).toBe("Philip");
    expect(state.contact?.email).toBe("daniel@histudio.test");
    expect(state.contact?.phone).toBe("+15551212");
    expect(state.contact?.customFields.company).toBe("HI Studio");
    expect(state.contact?.tags).toContain("lead");
    expect(finished.session).toBeNull();
    expect(finished.replies.at(-1)?.text).toMatch(/on our list/);
  });
});

describe("user input reply types", () => {
  it("normalizes numbers, dates and links", async () => {
    const { normalizeReply } = await import("@/lib/lead-capture");
    expect(normalizeReply("number", " $1,200 ")).toBe("1200");
    expect(normalizeReply("number", "2.5")).toBe("2.5");
    expect(() => normalizeReply("number", "a lot")).toThrow("Please reply with a number");
    expect(() => normalizeReply("number", "lots", "Just the number please 🙏")).toThrow("Just the number please 🙏");
    expect(normalizeReply("date", "2026-03-14")).toBe("2026-03-14");
    expect(normalizeReply("date", "14/03/2026")).toBe("2026-03-14");
    expect(normalizeReply("date", "March 14, 2026")).toBe("2026-03-14");
    expect(normalizeReply("date", "14 mar 2026")).toBe("2026-03-14");
    expect(() => normalizeReply("date", "31/02/2026")).toThrow("does not exist");
    expect(() => normalizeReply("date", "soon")).toThrow();
    expect(normalizeReply("url", "example.com/shop")).toBe("https://example.com/shop");
    expect(() => normalizeReply("url", "not a link")).toThrow();
    expect(normalizeReply(undefined, " hi ")).toBe("hi");
  });
});

describe("user input reply types in a flow", () => {
  it("asks again until the answer fits, then saves it", () => {
    const flows: FlowRecord[] = [
      {
        id: "budget",
        triggerType: "keyword",
        triggerValue: "budget",
        isActive: true,
        definition: {
          startStepId: "ask",
          steps: [
            { id: "ask", type: "capture", field: "custom:budget", prompt: "Budget?", replyType: "number", retryMessage: "Numbers only 🙏", next: "done" },
            { id: "done", type: "end", text: "Got {{budget}}" },
          ],
        },
      },
    ];
    const first = processInboundEvent({ contact: null, session: null, flows, event: { telegramUserId: "9", text: "budget" } });
    const wrong = processInboundEvent({ contact: first.contact, session: first.session, flows, event: { telegramUserId: "9", text: "not sure" } });
    expect(wrong.replies[0]!.text).toBe("Numbers only 🙏");
    expect(wrong.session?.stepId).toBe("ask");
    const right = processInboundEvent({ contact: wrong.contact, session: wrong.session, flows, event: { telegramUserId: "9", text: "$5,000" } });
    expect(right.contact.customFields.budget).toBe("5000");
  });
});
