/**
 * Conversation starters (Instagram ice breakers, Messenger persistent menu) and business hours.
 * Pure, browser safe. Stored on bots.settings.starters / bots.settings.hours.
 */
export type StarterItem = { title: string; flowId?: string | null; url?: string | null };

export type StartersSettings = {
  /** Instagram ice breakers: up to 4 questions shown before the first message. */
  iceBreakers: StarterItem[];
  /** Messenger persistent menu: up to 3 items (flows or links). */
  menu: StarterItem[];
};

export const FLOW_PAYLOAD_PREFIX = "flow:";

export function flowPayload(flowId: string) {
  return `${FLOW_PAYLOAD_PREFIX}${flowId}`;
}

export function flowIdFromPayload(payload: string | null | undefined) {
  return payload?.startsWith(FLOW_PAYLOAD_PREFIX) ? payload.slice(FLOW_PAYLOAD_PREFIX.length) || null : null;
}

function cleanItems(raw: unknown, max: number, allowUrl: boolean): StarterItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as StarterItem)
    .map((item) => ({
      title: String(item?.title ?? "").trim().slice(0, 80),
      flowId: item?.flowId ? String(item.flowId) : null,
      url: allowUrl && item?.url && /^https:\/\//i.test(String(item.url)) ? String(item.url).trim() : null,
    }))
    .filter((item) => item.title && (item.flowId || item.url))
    .slice(0, max);
}

export function readStarters(settings: Record<string, unknown> | null | undefined): StartersSettings {
  const raw = (settings?.starters ?? {}) as Partial<StartersSettings>;
  return { iceBreakers: cleanItems(raw.iceBreakers, 4, false), menu: cleanItems(raw.menu, 3, true) };
}

/** Graph / Zernio shapes. */
export function iceBreakerPayload(items: StarterItem[]) {
  return items.filter((item) => item.flowId).map((item) => ({ question: item.title, payload: flowPayload(item.flowId!) }));
}

export function persistentMenuPayload(items: StarterItem[]) {
  return [
    {
      locale: "default",
      composer_input_disabled: false,
      call_to_actions: items.map((item) =>
        item.url ? { type: "web_url", title: item.title.slice(0, 30), url: item.url } : { type: "postback", title: item.title.slice(0, 30), payload: flowPayload(item.flowId!) },
      ),
    },
  ];
}

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type BusinessHours = {
  enabled: boolean;
  timezone: string;
  /** "09:00"-"17:00" per day; missing day = closed. */
  days: Partial<Record<Weekday, { open: string; close: string }>>;
  awayMessage: string;
};

export const DEFAULT_HOURS: BusinessHours = {
  enabled: false,
  timezone: "America/Los_Angeles",
  days: Object.fromEntries(WEEKDAYS.slice(0, 5).map((day) => [day, { open: "09:00", close: "17:00" }])) as BusinessHours["days"],
  awayMessage: "Thanks for your message! We're away right now and will reply when we're back.",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readHours(settings: Record<string, unknown> | null | undefined): BusinessHours {
  const raw = (settings?.hours ?? {}) as Partial<BusinessHours>;
  const days: BusinessHours["days"] = {};
  for (const day of WEEKDAYS) {
    const value = raw.days?.[day];
    if (value && TIME.test(value.open) && TIME.test(value.close)) days[day] = { open: value.open, close: value.close };
  }
  let timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_HOURS.timezone;
  // Named zones only: Postgres reads offsets like "+05:30" the POSIX way (reversed), which would skew reports.
  if (!timezone.includes("/") && timezone !== "UTC") timezone = "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    timezone = "UTC";
  }
  return {
    enabled: Boolean(raw.enabled),
    timezone,
    days: raw.days ? days : DEFAULT_HOURS.days,
    awayMessage: typeof raw.awayMessage === "string" && raw.awayMessage.trim() ? raw.awayMessage.trim().slice(0, 1000) : DEFAULT_HOURS.awayMessage,
  };
}

/** Is `date` inside the configured hours, in the configured time zone? Overnight spans (22:00–02:00) work. */
export function isWithinHours(hours: BusinessHours, date = new Date()) {
  if (!hours.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")!.value.toLowerCase().slice(0, 3) as Weekday;
  const minutes = Number(parts.find((part) => part.type === "hour")!.value) * 60 + Number(parts.find((part) => part.type === "minute")!.value);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const today = hours.days[weekday];
  if (today) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  const previous = hours.days[WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7]!];
  if (previous) {
    const open = toMinutes(previous.open);
    const close = toMinutes(previous.close);
    if (close <= open && minutes < close) return true;
  }
  return false;
}
