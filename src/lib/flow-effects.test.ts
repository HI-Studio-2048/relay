import { describe, expect, it } from "vitest";
import { interpolateTemplate } from "@/lib/flow-effects";
import type { ContactRecord } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "99",
  username: "ada",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@histudio.test",
  phone: "555",
  customFields: { company: "HI Studio" },
  tags: [],
};

describe("flow effect templates", () => {
  it("interpolates contact fields", () => {
    expect(interpolateTemplate("{{name}} {{email}} {{telegram_id}} {{field:company}}", contact)).toBe(
      "Ada Lovelace ada@histudio.test 99 HI Studio",
    );
  });
});

describe("interpolateTemplate", () => {
  const contact = {
    id: "c",
    telegramUserId: "42",
    username: "ada",
    firstName: "Ada",
    lastName: null,
    email: null,
    phone: null,
    customFields: { company: "Acme", _cm: "x" },
    tags: [],
  };

  it("supports ManyChat names, bare custom fields and fallbacks", () => {
    expect(interpolateTemplate("Hi {{first_name}} from {{company}}", contact)).toBe("Hi Ada from Acme");
    expect(interpolateTemplate("{{ last_name | friend }}!", contact)).toBe("friend!");
    expect(interpolateTemplate("{{field:company}} {{name}}", contact)).toBe("Acme Ada");
    expect(interpolateTemplate("{{unknown}} stays", contact)).toBe("{{unknown}} stays");
    expect(interpolateTemplate("{{unknown|ok}}", contact)).toBe("ok");
  });

  it("encodes values inside URLs so they can't add or cut query params", () => {
    const sneaky = { ...contact, firstName: "x&client_reference_id=other#" };
    expect(interpolateTemplate("https://buy.stripe.com/a?n={{first_name}}&client_reference_id={{contact_id}}", sneaky, {}, "url")).toBe(
      "https://buy.stripe.com/a?n=x%26client_reference_id%3Dother%23&client_reference_id=c",
    );
    expect(interpolateTemplate("{{company}}", { ...contact, customFields: { company: "https://acme.test/x" } }, {}, "url")).toBe("https://acme.test/x");
  });

  it("keeps {{contact_id}} as Recatch's id (Stripe matches on it); an imported field stays reachable via field:", () => {
    const imported = { ...contact, customFields: { contact_id: "mc-77" } };
    expect(interpolateTemplate("{{contact_id}}", imported)).toBe("c");
    expect(interpolateTemplate("{{field:contact_id}}", imported)).toBe("mc-77");
  });
});

describe("bot fields", () => {
  it("reads, sanitizes and interpolates {{bot.key}}", async () => {
    const { botFieldValues, readBotFields } = await import("@/lib/template");
    expect(readBotFields({ botFields: [{ key: "Promo Code", value: "SPRING20" }, { key: "", value: "x" }, "junk"] })).toEqual([
      { key: "promo_code", value: "SPRING20" },
    ]);
    const values = botFieldValues({ botFields: [{ key: "promo_code", value: "SPRING20" }] });
    const contact = { id: "c", telegramUserId: "1", username: null, firstName: "Ada", lastName: null, email: null, phone: null, customFields: {}, tags: [] };
    expect(interpolateTemplate("Use {{bot.promo_code}}, {{first_name}}! {{bot.missing|none}}", contact, values)).toBe("Use SPRING20, Ada! none");
  });
});

describe("team alerts", () => {
  it("formats per service and only accepts https in production-like checks", async () => {
    const { alertPayload, readAlerts } = await import("@/lib/flow-effects");
    expect(alertPayload("https://hooks.slack.com/services/x", "Hand-off", "https://relay.app/inbox/1")).toEqual({ text: "Hand-off\nhttps://relay.app/inbox/1" });
    expect(alertPayload("https://discord.com/api/webhooks/1/abc", "Hand-off")).toEqual({ content: "Hand-off" });
    expect(readAlerts({ alerts: { webhookUrl: " https://hooks.slack.com/services/x " } })).toEqual({ webhookUrl: "https://hooks.slack.com/services/x" });
    expect(readAlerts({ alerts: { webhookUrl: "javascript:alert(1)" } })).toEqual({ webhookUrl: "" });
    expect(readAlerts(null)).toEqual({ webhookUrl: "" });
  });
});
