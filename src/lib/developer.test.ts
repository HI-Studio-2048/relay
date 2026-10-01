import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, isWebhookEvent, publicContact, signWebhookBody } from "@/lib/developer";
import { contactRuleEvents } from "@/lib/rule-types";
import type { ContactRecord } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "acc:u",
  username: "ada",
  firstName: "Ada",
  lastName: null,
  email: null,
  phone: null,
  customFields: { plan: "pro", _cm: "internal" },
  tags: ["lead"],
};

describe("developer platform", () => {
  it("generates prefixed keys and stores only a hash", () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key).toMatch(/^rly_[A-Za-z0-9_-]{32}$/);
    expect(prefix).toBe(key.slice(0, 10));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key);
    expect(generateApiKey().key).not.toBe(key);
  });

  it("signs webhook bodies with hex HMAC-SHA256", () => {
    expect(signWebhookBody("s", '{"a":1}')).toBe(createHmac("sha256", "s").update('{"a":1}').digest("hex"));
  });

  it("hides internal fields from the public contact", () => {
    expect(publicContact(contact).fields).toEqual({ plan: "pro" });
    expect(publicContact(contact).external_id).toBe("acc:u");
  });

  it("knows its events", () => {
    expect(isWebhookEvent("contact.created")).toBe(true);
    expect(isWebhookEvent("contact.deleted")).toBe(false);
  });

  it("treats email and phone captures as field_set", () => {
    const events = contactRuleEvents(contact, { ...contact, email: "a@b.co", phone: "+1555" });
    expect(events).toEqual([
      { type: "field_set", value: "email" },
      { type: "field_set", value: "phone" },
    ]);
    expect(contactRuleEvents({ ...contact, email: "a@b.co" }, { ...contact, email: "a@b.co" })).toEqual([]);
  });
});
