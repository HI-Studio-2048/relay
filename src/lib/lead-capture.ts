import type { CaptureField, ContactRecord } from "@/lib/types";

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
