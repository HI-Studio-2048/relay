import { describe, expect, it } from "vitest";
import { buildMetaMessages } from "@/lib/channels/meta";
import { messagingWindow } from "@/lib/messaging-window";

const now = Date.parse("2026-10-10T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

describe("messaging window", () => {
  it("is open for 24 hours after the last inbound message", () => {
    expect(messagingWindow("instagram", "zernio", hoursAgo(5), now)).toEqual({ kind: "open", hoursLeft: 19 });
  });

  it("allows human agent replies on Instagram / Messenger for 7 days", () => {
    expect(messagingWindow(null, "messenger", hoursAgo(30), now)).toEqual({ kind: "human_agent", hoursLeft: 138 });
    expect(messagingWindow("instagram", null, hoursAgo(24 * 8), now)).toEqual({ kind: "closed", whatsapp: false });
  });

  it("closes WhatsApp after 24 hours", () => {
    expect(messagingWindow("whatsapp", "zernio", hoursAgo(25), now)).toEqual({ kind: "closed", whatsapp: true });
  });

  it("does not apply to Telegram or networks without a window", () => {
    expect(messagingWindow(null, "telegram", hoursAgo(1000), now)).toEqual({ kind: "none" });
    expect(messagingWindow("tiktok", "zernio", hoursAgo(1000), now)).toEqual({ kind: "none" });
  });

  it("keeps the Meta message body unchanged for human agent replies", () => {
    expect(buildMetaMessages({ text: "Hi", source: "agent", humanAgent: true }, "messenger")).toEqual([{ text: "Hi" }]);
  });
});
