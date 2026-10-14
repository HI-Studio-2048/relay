import { describe, expect, it } from "vitest";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { parseZernioWebhook } from "@/lib/channels/zernio";
import { flowPayload, iceBreakerPayload, isWithinHours, persistentMenuPayload, readHours, readStarters } from "@/lib/starters";

const hours = readHours({
  hours: {
    enabled: true,
    timezone: "America/New_York",
    days: { mon: { open: "09:00", close: "17:00" }, fri: { open: "22:00", close: "02:00" }, tue: { open: "9am", close: "5pm" } },
  },
});

describe("business hours", () => {
  it("drops malformed days and keeps valid ones", () => {
    expect(Object.keys(hours.days)).toEqual(["mon", "fri"]);
  });

  it("evaluates in the configured time zone", () => {
    // Monday 2026-10-05 14:00 UTC = 10:00 New York
    expect(isWithinHours(hours, new Date("2026-10-05T14:00:00Z"))).toBe(true);
    // Monday 12:00 UTC = 08:00 New York
    expect(isWithinHours(hours, new Date("2026-10-05T12:00:00Z"))).toBe(false);
    // Tuesday is closed (bad times dropped)
    expect(isWithinHours(hours, new Date("2026-10-06T15:00:00Z"))).toBe(false);
  });

  it("handles spans that cross midnight", () => {
    // Friday 23:00 NY and Saturday 01:30 NY are open; Saturday 03:00 is not
    expect(isWithinHours(hours, new Date("2026-10-10T03:00:00Z"))).toBe(true);
    expect(isWithinHours(hours, new Date("2026-10-10T05:30:00Z"))).toBe(true);
    expect(isWithinHours(hours, new Date("2026-10-10T07:00:00Z"))).toBe(false);
  });

  it("is always open when disabled and survives bad time zones", () => {
    expect(isWithinHours({ ...hours, enabled: false }, new Date("2026-10-05T03:00:00Z"))).toBe(true);
    expect(readHours({ hours: { timezone: "Mars/Olympus" } }).timezone).toBe("UTC");
  });
});

describe("conversation starters", () => {
  it("sanitizes items and builds platform payloads", () => {
    const starters = readStarters({
      starters: {
        iceBreakers: [{ title: "Prices?", flowId: "f1" }, { title: "", flowId: "f2" }, { title: "No target" }],
        menu: [{ title: "Book", url: "https://cal.com/x" }, { title: "Bad link", url: "javascript:alert(1)" }],
      },
    });
    expect(starters.iceBreakers).toEqual([{ title: "Prices?", flowId: "f1", url: null }]);
    expect(starters.menu).toEqual([{ title: "Book", flowId: null, url: "https://cal.com/x" }]);
    expect(iceBreakerPayload(starters.iceBreakers)).toEqual([{ question: "Prices?", payload: "flow:f1" }]);
    expect(persistentMenuPayload(starters.menu)[0]!.call_to_actions).toEqual([{ type: "web_url", title: "Book", url: "https://cal.com/x" }]);
  });

  it("starts the flow named in a flow: payload, replacing the current session", () => {
    const pricing: FlowRecord = {
      id: "pricing",
      triggerType: "keyword",
      triggerValue: "zzz",
      isActive: true,
      definition: { startStepId: "a", steps: [{ id: "a", type: "end", text: "Plans start at $49" }] },
    };
    const result = processInboundEvent({
      contact: null,
      session: { id: "s", contactId: "c", flowId: "other", stepId: "x", awaitingInput: true, status: "active" },
      flows: [pricing],
      event: { telegramUserId: "u", callbackData: flowPayload("pricing") },
    });
    expect(result.replies[0]?.text).toBe("Plans start at $49");
    expect(result.startedFlowId).toBe("pricing");
  });

  it("maps a Zernio ice breaker tap to a flow payload", () => {
    const [event] = parseZernioWebhook({
      event: "message.received",
      message: { conversationId: "c", direction: "incoming", text: "Prices?", sender: { id: "u" }, attachments: [] },
      account: { id: "acc", accountId: "acc", platform: "instagram", username: "x" },
      metadata: { postbackPayload: "flow:pricing", postbackTitle: "Prices?" },
    });
    expect(event).toMatchObject({ callbackData: "flow:pricing", callbackTitle: "Prices?", text: null });
  });
});
