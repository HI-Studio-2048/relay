import { describe, expect, it } from "vitest";
import { renderWhatsAppText } from "@/lib/channels/format";
import { buildMetaMessages, parseMetaWebhook, verifyMetaSignature } from "@/lib/channels/meta";
import { buildWhatsAppMessages, parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { parseTelegramUpdate } from "@/lib/channels";
import { channelOf } from "@/lib/channels/types";
import { channelStartUrl } from "@/lib/growth";
import { createHmac } from "node:crypto";

describe("channel catalog", () => {
  it("defaults unknown or legacy rows to Telegram", () => {
    expect(channelOf(null)).toBe("telegram");
    expect(channelOf("whatsapp")).toBe("whatsapp");
    expect(channelOf("tiktok")).toBe("telegram");
  });

  it("builds ManyChat-style entry links per channel", () => {
    expect(channelStartUrl({ channel: "telegram", handle: "@relay_bot" }, "promo")).toBe("https://t.me/relay_bot?start=promo");
    expect(channelStartUrl({ channel: "messenger", handle: "histudio" }, "promo")).toBe("https://m.me/histudio?ref=promo");
    expect(channelStartUrl({ channel: "messenger", handle: null, externalAccountId: "123" }, "promo")).toBe("https://m.me/123?ref=promo");
    expect(channelStartUrl({ channel: "instagram", handle: "hi.studio" }, "promo")).toBe("https://ig.me/m/hi.studio?ref=promo");
    expect(channelStartUrl({ channel: "whatsapp", handle: "+1 555-010-9999" }, "promo")).toBe("https://wa.me/15550109999?text=promo");
  });
});

describe("Messenger / Instagram adapter", () => {
  it("sends media first, then text with postback + URL buttons as a button template", () => {
    const messages = buildMetaMessages(
      {
        text: "**Welcome** to HI Studio",
        media: { url: "https://cdn.example/a.jpg", kind: "photo" },
        buttons: [
          { text: "Pricing", data: "n:pricing" },
          { text: "Site", url: "https://histudio.test" },
        ],
        source: "flow",
      },
      "messenger",
    );
    expect(messages[0]).toEqual({ attachment: { type: "image", payload: { url: "https://cdn.example/a.jpg", is_reusable: true } } });
    expect(messages[1]).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome to HI Studio",
          buttons: [
            { type: "postback", title: "Pricing", payload: "n:pricing" },
            { type: "web_url", title: "Site", url: "https://histudio.test" },
          ],
        },
      },
    });
  });

  it("renders quick replies and a generic template on Instagram", () => {
    const messages = buildMetaMessages(
      { text: "Want a call?", keyboard: ["Yes", "No"], buttons: [{ text: "Book", data: "n:book" }], source: "flow" },
      "instagram",
    );
    expect(messages).toHaveLength(1);
    const message = messages[0] as { attachment: { payload: { template_type: string } }; quick_replies: unknown[] };
    expect(message.attachment.payload.template_type).toBe("generic");
    expect(message.quick_replies).toEqual([
      { content_type: "text", title: "Yes", payload: "qr:Yes" },
      { content_type: "text", title: "No", payload: "qr:No" },
    ]);
  });

  it("normalizes text, quick replies, postbacks, Get Started, and ref links", () => {
    const events = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "page",
          messaging: [
            { sender: { id: "u1" }, message: { mid: "m1", text: "hello" } },
            { sender: { id: "u1" }, message: { mid: "m2", is_echo: true, text: "echo" } },
            { sender: { id: "u2" }, message: { mid: "m3", quick_reply: { payload: "qr:Yes" }, text: "Yes" } },
            { sender: { id: "u3" }, postback: { title: "Pricing", payload: "n:pricing" } },
            { sender: { id: "u4" }, postback: { title: "Get Started", payload: "GET_STARTED", referral: { ref: "promo" } } },
            { sender: { id: "u5" }, referral: { ref: "spring" } },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { externalUserId: "u1", text: "hello", callbackData: null, externalMessageId: "m1", referral: null },
      { externalUserId: "u2", text: "Yes", callbackData: null, externalMessageId: "m3", referral: null },
      { externalUserId: "u3", text: null, callbackData: "n:pricing", referral: null },
      { externalUserId: "u4", text: "/start promo", callbackData: null, referral: "promo" },
      { externalUserId: "u5", text: "/start spring", referral: "spring" },
    ]);
  });

  it("verifies X-Hub-Signature-256 and accepts unsigned payloads only without an app secret", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature("secret", body, good)).toBe(true);
    expect(verifyMetaSignature("secret", body, "sha256=00")).toBe(false);
    expect(verifyMetaSignature("secret", body, null)).toBe(false);
    expect(verifyMetaSignature(null, body, null)).toBe(true);
  });
});

describe("WhatsApp adapter", () => {
  it("converts formatting and turns callbacks + quick replies into reply buttons", () => {
    expect(renderWhatsAppText("**Hi** __there__ ~~x~~ `y` [site](https://a.b)")).toBe("*Hi* _there_ ~x~ ```y``` site (https://a.b)");
    const messages = buildWhatsAppMessages({
      text: "Pick one",
      buttons: [
        { text: "Pricing", data: "n:pricing" },
        { text: "Site", url: "https://histudio.test" },
      ],
      keyboard: ["Later"],
      source: "flow",
    });
    expect(messages).toEqual([
      {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Pick one\nSite: https://histudio.test" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "n:pricing", title: "Pricing" } },
              { type: "reply", reply: { id: "qr:Later", title: "Later" } },
            ],
          },
        },
      },
    ]);
  });

  it("falls back to a list beyond three choices and captions image media", () => {
    const many = buildWhatsAppMessages({ text: "Menu", keyboard: ["A", "B", "C", "D"], source: "flow" });
    expect((many[0] as { interactive: { type: string } }).interactive.type).toBe("list");
    const media = buildWhatsAppMessages({ text: "Look", media: { url: "https://cdn/x.jpg", kind: "photo" }, source: "flow" });
    expect(media).toEqual([{ type: "image", image: { link: "https://cdn/x.jpg", caption: "Look" } }]);
  });

  it("normalizes inbound text, button replies, and the sender phone", () => {
    const events = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "p1" },
                contacts: [{ wa_id: "15550001111", profile: { name: "Dana Reyes" } }],
                messages: [
                  { from: "15550001111", id: "w1", type: "text", text: { body: "hi" } },
                  { from: "15550001111", id: "w2", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "n:pricing", title: "Pricing" } } },
                  { from: "15550001111", id: "w3", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "qr:Later", title: "Later" } } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0]).toMatchObject({ externalUserId: "15550001111", firstName: "Dana", lastName: "Reyes", text: "hi", contactPhone: "+15550001111" });
    expect(events[1]).toMatchObject({ callbackData: "n:pricing", text: "Pricing" });
    expect(events[2]).toMatchObject({ callbackData: null, text: "Later" });
  });
});

describe("Telegram normalizer", () => {
  it("keeps the existing Telegram semantics", () => {
    const events = parseTelegramUpdate({
      update_id: 1,
      callback_query: { id: "cb", data: "n:x", from: { id: 7, first_name: "Ana", username: "ana" } },
    });
    expect(events[0]).toMatchObject({ externalUserId: "7", callbackData: "n:x", ackCallbackId: "cb", username: "ana" });
    expect(parseTelegramUpdate({ update_id: 2, message: { message_id: 1, from: { id: 1, is_bot: true } } })).toEqual([]);
  });
});
