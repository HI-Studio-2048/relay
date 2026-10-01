/**
 * Meta's messaging windows. Free-form messages reach Instagram / Messenger / WhatsApp users only
 * within 24 hours of their last message; Instagram and Messenger allow a human agent reply (the
 * HUMAN_AGENT tag) for 7 days; WhatsApp needs an approved template after 24 hours.
 */
export type WindowState =
  | { kind: "none" }
  | { kind: "open"; hoursLeft: number }
  | { kind: "human_agent"; hoursLeft: number }
  | { kind: "closed"; whatsapp: boolean };

const HOUR = 3_600_000;

export function windowPlatform(platform: string | null | undefined, channel: string | null | undefined) {
  const value = platform || channel || "";
  if (value === "instagram") return "instagram";
  if (value === "facebook" || value === "messenger") return "messenger";
  if (value === "whatsapp") return "whatsapp";
  return null;
}

export function messagingWindow(
  platform: string | null | undefined,
  channel: string | null | undefined,
  lastInboundAt: string | Date | null | undefined,
  now = Date.now(),
): WindowState {
  const network = windowPlatform(platform, channel);
  if (!network) return { kind: "none" };
  if (!lastInboundAt) return { kind: "closed", whatsapp: network === "whatsapp" };
  const elapsed = now - new Date(lastInboundAt).getTime();
  if (elapsed < 24 * HOUR) return { kind: "open", hoursLeft: Math.max(0, Math.ceil((24 * HOUR - elapsed) / HOUR)) };
  if (network !== "whatsapp" && elapsed < 7 * 24 * HOUR) return { kind: "human_agent", hoursLeft: Math.ceil((7 * 24 * HOUR - elapsed) / HOUR) };
  return { kind: "closed", whatsapp: network === "whatsapp" };
}
