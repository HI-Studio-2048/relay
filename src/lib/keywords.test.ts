import { describe, expect, it } from "vitest";
import { compareKeywordPriority, matchesKeywordRule, parseKeywordList, shadowedKeywords } from "@/lib/keywords";
import { chooseRandomizerPath, delaySecondsFromUnit, nextResumeAt } from "@/lib/smart-delay";
import { matchFlowTrigger, processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord } from "@/lib/types";

const contact = (overrides: Partial<ContactRecord> = {}): ContactRecord => ({
  id: "c1",
  telegramUserId: "1001",
  username: "daniel",
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  customFields: {},
  tags: [],
  ...overrides,
});

function flow(partial: Partial<FlowRecord> & Pick<FlowRecord, "id" | "triggerType">): FlowRecord {
  return {
    triggerValue: null,
    isActive: true,
    definition: { startStepId: "a", steps: [{ id: "a", type: "end", text: partial.id }] },
    ...partial,
  };
}

describe("ManyChat keyword rules", () => {
  it("parses up to 10 comma-separated keywords", () => {
    expect(parseKeywordList("Hello, HI\nhey")).toEqual(["hello", "hi", "hey"]);
    expect(parseKeywordList("a,b,c,d,e,f,g,h,i,j,k")).toHaveLength(10);
  });

  it("matches the five Telegram rules from ManyChat Help", () => {
    expect(matchesKeywordRule("keyword", "Hello", ["hello"])).toBe(true);
    expect(matchesKeywordRule("keyword", "hello there", ["hello"])).toBe(false);
    expect(matchesKeywordRule("keyword_contains", "Hello, please send info", ["hello"])).toBe(true);
    expect(matchesKeywordRule("keyword_word", "I dislike this", ["like"])).toBe(false);
    expect(matchesKeywordRule("keyword_word", "I like this", ["like"])).toBe(true);
    expect(matchesKeywordRule("keyword_starts_with", "can you help", ["can you"])).toBe(true);
    expect(matchesKeywordRule("keyword_starts_with", "please can you", ["can you"])).toBe(false);
    expect(matchesKeywordRule("keyword_not_contains", "hello", ["refund"])).toBe(true);
    expect(matchesKeywordRule("keyword_not_contains", "I want a refund", ["refund"])).toBe(false);
  });

  it("uses list order as priority when two keywords match", () => {
    const discount = flow({ id: "discount", triggerType: "keyword_contains", triggerValue: "discount", priority: 0 });
    const sale = flow({ id: "sale", triggerType: "keyword_contains", triggerValue: "sale", priority: 1 });
    expect(matchFlowTrigger([sale, discount], "big sale discount")?.id).toBe("discount");
    expect(compareKeywordPriority(discount, sale)).toBeLessThan(0);
  });
});

describe("welcome once and randomizer / smart delay", () => {
  it("fires the /start welcome only the first time", () => {
    const welcome = flow({ id: "welcome", triggerType: "start" });
    const first = processInboundEvent({
      contact: contact(),
      session: null,
      flows: [welcome],
      event: { telegramUserId: "1001", text: "/start" },
    });
    expect(first.replies[0]?.text).toBe("welcome");
    expect(first.contact.welcomed).toBe(true);

    const second = processInboundEvent({
      contact: first.contact,
      session: null,
      flows: [welcome],
      event: { telegramUserId: "1001", text: "/start" },
    });
    expect(second.replies).toEqual([]);
  });

  it("still matches growth-link /start after welcome", () => {
    const welcome = flow({ id: "welcome", triggerType: "start" });
    const promo = flow({ id: "promo", triggerType: "start_param", triggerValue: "promo" });
    const result = processInboundEvent({
      contact: contact({ welcomed: true }),
      session: null,
      flows: [welcome, promo],
      event: { telegramUserId: "1001", text: "/start promo" },
    });
    expect(result.replies[0]?.text).toBe("promo");
  });

  it("picks a randomizer path from the roll and keeps a sticky assignment", () => {
    expect(chooseRandomizerPath([{ id: "a", percent: 50, next: "one" }, { id: "b", percent: 50, next: "two" }], 0.1)?.id).toBe("a");
    expect(chooseRandomizerPath([{ id: "a", percent: 50, next: "one" }, { id: "b", percent: 50, next: "two" }], 0.9)?.id).toBe("b");

    const definition = {
      startStepId: "split",
      steps: [
        {
          id: "split",
          type: "randomizer" as const,
          sticky: true,
          paths: [
            { id: "a", percent: 50, next: "one" },
            { id: "b", percent: 50, next: "two" },
          ],
        },
        { id: "one", type: "end" as const, text: "A" },
        { id: "two", type: "end" as const, text: "B" },
      ],
    };
    const result = processInboundEvent({
      contact: contact({ customFields: { "_rand:split": "b" } }),
      session: null,
      flows: [{ id: "f", triggerType: "keyword", triggerValue: "go", isActive: true, definition }],
      event: { telegramUserId: "1001", text: "go" },
    });
    expect(result.replies[0]?.text).toBe("B");
  });

  it("converts Smart Delay units and defers outside the send window", () => {
    expect(delaySecondsFromUnit(2, "hours")).toBe(7200);
    expect(delaySecondsFromUnit(1, "days")).toBe(86400);
    const due = nextResumeAt(new Date(2026, 8, 6, 23, 0, 0).getTime(), 0, "09:00", "21:00");
    expect(due.getHours()).toBe(9);
    expect(due.getDate()).toBe(7);
  });
});

describe("shadowed keywords", () => {
  it("flags keywords a higher flow always catches", () => {
    const flows = [
      { id: "a", name: "Pricing", triggerType: "keyword_contains", triggerValue: "price", isActive: true },
      { id: "b", name: "Price list", triggerType: "keyword", triggerValue: "price list, menu", isActive: true },
      { id: "c", name: "Off", triggerType: "keyword_contains", triggerValue: "menu", isActive: false },
      { id: "d", name: "Menu", triggerType: "keyword_word", triggerValue: "menu", isActive: true },
    ];
    expect(shadowedKeywords(flows)).toEqual([
      { flowId: "b", keyword: "price list", byFlowId: "a", byName: "Pricing" },
      { flowId: "d", keyword: "menu", byFlowId: "b", byName: "Price list" },
    ]);
  });
});
