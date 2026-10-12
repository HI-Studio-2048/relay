import { describe, expect, it } from "vitest";
import {
  applyGrowthAttribution,
  attributedContact,
  linksForFlow,
  parseStartPayload,
  preferLinkedFlow,
  slugifyName,
  telegramStartUrl,
} from "@/lib/growth";
import type { FlowRecord } from "@/lib/flow-engine";

const emptyFlow = {
  startStepId: "start",
  steps: [{ id: "start", type: "end" as const, text: "ok" }],
};

describe("growth links", () => {
  it("parses Telegram /start payloads", () => {
    expect(parseStartPayload("/start")).toBeNull();
    expect(parseStartPayload("/start@relay_bot")).toBeNull();
    expect(parseStartPayload("/start ig_bio")).toBe("ig_bio");
    expect(parseStartPayload("/start@relay_bot summer_sale")).toBe("summer_sale");
  });

  it("slugifies names to Telegram start-param rules", () => {
    expect(slugifyName("Instagram Bio")).toBe("instagram_bio");
    expect(slugifyName("  Ads / April  ")).toBe("ads_april");
  });

  it("builds a t.me deep link", () => {
    expect(telegramStartUrl("relay_demo_bot", "ig_bio")).toBe("https://t.me/relay_demo_bot?start=ig_bio");
  });

  it("applies tag and UTM fields onto the contact", () => {
    const next = applyGrowthAttribution(
      {
        id: "c1",
        telegramUserId: "1",
        username: null,
        firstName: "Ada",
        lastName: null,
        email: null,
        phone: null,
        customFields: {},
        tags: ["lead"],
      },
      { tagName: "ig", utmSource: "instagram", utmMedium: "bio", utmCampaign: "april" },
    );
    expect(next.tags).toEqual(["lead", "ig"]);
    expect(next.customFields).toEqual({
      utm_source: "instagram",
      utm_medium: "bio",
      utm_campaign: "april",
    });
  });

  it("prefers the linked flow as the /start match", () => {
    const start: FlowRecord = {
      id: "start-flow",
      triggerType: "start",
      triggerValue: "/start",
      isActive: true,
      definition: emptyFlow,
    };
    const ads: FlowRecord = {
      id: "ads-flow",
      triggerType: "keyword",
      triggerValue: "ads",
      isActive: true,
      definition: emptyFlow,
    };
    const ordered = preferLinkedFlow([start, ads], "ads-flow", "ads");
    expect(ordered[0]?.id).toBe("ads-flow");
    expect(ordered[0]?.triggerType).toBe("start_param");
    expect(ordered[0]?.triggerValue).toBe("ads");
  });

  it("keeps only growth links tied to one flow", () => {
    const links = [
      { id: "a", flowId: "flow-1" },
      { id: "b", flowId: null },
      { id: "c", flowId: "flow-2" },
      { id: "d", flowId: "flow-1" },
    ];
    expect(linksForFlow(links, "flow-1").map((link) => link.id)).toEqual(["a", "d"]);
  });

  it("attributes a new contact before the flow runs", () => {
    const contact = attributedContact(
      null,
      { telegramUserId: "9", username: "ada", firstName: "Ada", lastName: null },
      { tagName: "ig", utmSource: "instagram", utmMedium: "bio", utmCampaign: null },
    );
    expect(contact.tags).toEqual(["ig"]);
    expect(contact.customFields.utm_source).toBe("instagram");
    expect(contact.telegramUserId).toBe("9");
  });
});
