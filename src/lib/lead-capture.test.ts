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
