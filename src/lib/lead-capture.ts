import type { CaptureField, CaptureValidation, ContactRecord } from "@/lib/types";

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

export const CAPTURE_VALIDATIONS: { value: CaptureValidation; label: string; retry: string }[] = [
  { value: "text", label: "Any text", retry: "Please type your answer." },
  { value: "number", label: "Number", retry: "Please reply with a number, like 42 or 3.5." },
  { value: "email", label: "Email", retry: "That does not look like an email. Please try again, like name@example.com." },
  { value: "phone", label: "Phone", retry: "Please send a phone number with country code, like +1 555 123 4567." },
  { value: "url", label: "URL", retry: "Please send a link, like example.com." },
  { value: "date", label: "Date", retry: "Please send a date, like 2026-10-06 or 06/10/2026." },
];

export function defaultRetryText(validation: CaptureValidation): string {
  return CAPTURE_VALIDATIONS.find((item) => item.value === validation)!.retry;
}

/** The validation that applies when a step does not set one: email and phone fields always check their format. */
export function effectiveValidation(field: CaptureField, validation: CaptureValidation | undefined): CaptureValidation {
  if (validation && validation !== "text") return validation;
  if (field === "email") return "email";
  if (field === "phone") return "phone";
  return "text";
}

const pad = (value: number) => String(value).padStart(2, "0");

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDate(value: string): string | null {
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  // Day first (06/10/2026, 6.10.2026): the order most Telegram audiences write dates in.
  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  // "Oct 6 2026", "6 October 2026"
  if (/[a-z]/i.test(value) && /\d{4}/.test(value)) {
    const parsed = new Date(`${value} 12:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return isoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
    }
  }
  return null;
}

/**
 * Check a User Input answer against its reply type and normalize it for storage
 * (numbers without separators, lowercase email, +digits phone, https URL, ISO date).
 * Returns null when the answer is not valid.
 */
export function validateAnswer(validation: CaptureValidation, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  switch (validation) {
    case "text":
      return value;
    case "number": {
      const cleaned = value.replace(/[\s_]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
      return String(Number(cleaned));
    }
    case "email":
      return EMAIL_RE.test(value) ? value.toLowerCase() : null;
    case "phone": {
      if (/[^\d\s()+.-]/.test(value)) return null;
      const digits = value.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) return null;
      return value.trim().startsWith("+") || digits.length > 10 ? `+${digits}` : digits;
    }
    case "url": {
      if (/\s/.test(value)) return null;
      try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (!/^[^.]+(\.[^.]+)+$/.test(url.hostname)) return null;
        return url.toString();
      } catch {
        return null;
      }
    }
    case "date":
      return parseDate(value);
  }
}
