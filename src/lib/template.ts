import type { ContactRecord } from "@/lib/types";

/**
 * Personalization. ManyChat names ({{first_name}}, {{last_name}}, {{full_name}}) plus Relay's
 * {{name}} / {{field:key}}, any custom field by bare key ({{company}}), and a fallback after a pipe
 * for empty values: {{first_name|there}}.
 */
export function interpolateTemplate(template: string, contact: ContactRecord, extra: Record<string, string> = {}): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const builtins: Record<string, string> = {
    name,
    full_name: name,
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    username: contact.username ?? "",
    telegram_id: contact.telegramUserId,
    user_id: contact.telegramUserId,
    platform: contact.platform ?? "",
    // For payment links: ?client_reference_id={{contact_id}} lets Stripe report the purchase back.
    contact_id: contact.id,
    ...extra,
  };
  return template.replace(/\{\{\s*([a-z0-9_:.]+)\s*(?:\|([^}]*))?\}\}/gi, (match, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    let value: string | undefined;
    if (key.startsWith("field:")) value = contact.customFields[rawKey.slice("field:".length)] ?? "";
    else if (key in builtins) value = builtins[key];
    else if (rawKey in contact.customFields) value = contact.customFields[rawKey];
    else if (fallback === undefined) return match;
    return value?.trim() ? value : (fallback ?? "").trim();
  });
}

export type BotField = { key: string; value: string };

/** Account-wide variables (ManyChat Bot Fields), usable as {{bot.key}} in any message. */
export function readBotFields(settings: Record<string, unknown> | null | undefined): BotField[] {
  const raw = settings?.botFields;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as BotField)
    .map((item) => ({
      key: String(item?.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""),
      value: String(item?.value ?? ""),
    }))
    .filter((item) => item.key)
    .slice(0, 50);
}

export function botFieldValues(settings: Record<string, unknown> | null | undefined): Record<string, string> {
  return Object.fromEntries(readBotFields(settings).map((field) => [`bot.${field.key}`, field.value]));
}
