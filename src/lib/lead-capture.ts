import type { CaptureField, ContactRecord, ReplyType } from "@/lib/types";

export class LeadCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadCaptureError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCaptureField(field: string): CaptureField {
  if (field === "name" || field === "email" || field === "phone") return field;
  if (field.startsWith("custom:")) {
    const key = field.slice("custom:".length).trim();
    if (!key) throw new LeadCaptureError("Custom field key is empty");
    return `custom:${key}`;
  }
  throw new LeadCaptureError(`Unknown capture field: ${field}`);
}

export function applyCapturedValue(
  contact: ContactRecord,
  field: CaptureField,
  raw: string,
): ContactRecord {
  const value = raw.trim();
  if (!value) throw new LeadCaptureError("Answer cannot be empty");

  if (field === "name") {
    const parts = value.split(/\s+/);
    return {
      ...contact,
      firstName: parts[0] ?? value,
      lastName: parts.slice(1).join(" ") || null,
    };
  }

  if (field === "email") {
    if (!EMAIL_RE.test(value)) throw new LeadCaptureError("That does not look like an email");
    return { ...contact, email: value.toLowerCase() };
  }

  if (field === "phone") {
    return { ...contact, phone: value };
  }

  const key = field.slice("custom:".length);
  return {
    ...contact,
    customFields: { ...contact.customFields, [key]: value },
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * User Input reply types. Returns the cleaned value to save, or throws with `retry` (or a default
 * message) so the contact is asked again.
 */
export function normalizeReply(type: ReplyType | undefined, raw: string, retry?: string): string {
  const value = raw.trim();
  const fail = (fallback: string): never => {
    throw new LeadCaptureError(retry?.trim() || fallback);
  };
  if (!type || type === "text") return value;
  if (type === "number") {
    const cleaned = value.replace(/[\s,$€£%]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) fail("Please reply with a number, like 25.");
    return String(Number(cleaned));
  }
  if (type === "url") {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if (!url.hostname.includes(".")) fail("Please send a link, like example.com.");
      return url.toString();
    } catch {
      return fail("Please send a link, like example.com.");
    }
  }
  // Dates: 2026-03-14, 14/03/2026 (day first), March 14 2026, 14 Mar.
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  const words = value.toLowerCase().match(/^(?:(\d{1,2})\s+([a-z]{3})[a-z]*|([a-z]{3})[a-z]*\s+(\d{1,2}))(?:,?\s+(\d{4}))?$/);
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3])];
  else if (words) {
    const monthName = words[2] ?? words[3]!;
    month = MONTHS.indexOf(monthName) + 1;
    day = Number(words[1] ?? words[4]);
    year = words[5] ? Number(words[5]) : new Date().getUTCFullYear();
  }
  if (!year || !month || !day) return fail("Please send a date, like 2026-03-14.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return fail("That date does not exist — try again?");
  return date.toISOString().slice(0, 10);
}

/** Silent assign for flow "set field" steps. Empty clears. Invalid email is skipped. */
export function assignFieldValue(
  contact: ContactRecord,
  field: CaptureField,
  raw: string,
): ContactRecord {
  const value = raw.trim();
  if (!value) {
    if (field === "name") return { ...contact, firstName: null, lastName: null };
    if (field === "email") return { ...contact, email: null };
    if (field === "phone") return { ...contact, phone: null };
    const key = field.slice("custom:".length);
    if (!key) return contact;
    const customFields = { ...contact.customFields };
    delete customFields[key];
    return { ...contact, customFields };
  }
  try {
    return applyCapturedValue(contact, field, value);
  } catch {
    return contact;
  }
}

export function displayName(contact: Pick<ContactRecord, "firstName" | "lastName" | "username" | "telegramUserId">) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (contact.username) return `@${contact.username}`;
  return contact.telegramUserId;
}
