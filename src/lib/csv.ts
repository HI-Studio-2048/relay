/** RFC 4180 CSV parsing: quoted fields, escaped quotes, CRLF, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export type ImportedContact = {
  externalId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  fields: Record<string, string>;
};

const ALIASES: Record<string, keyof Omit<ImportedContact, "tags" | "fields"> | "tags" | "name"> = {
  telegram_user_id: "externalId",
  user_id: "externalId",
  id: "externalId",
  username: "username",
  handle: "username",
  first_name: "firstName",
  firstname: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  name: "name",
  full_name: "name",
  email: "email",
  e_mail: "email",
  email_address: "email",
  phone: "phone",
  phone_number: "phone",
  tags: "tags",
};

const normalize = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Map a CSV (header row first) to contacts. Unknown columns become custom fields. */
export function contactsFromCsv(text: string): ImportedContact[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(normalize);
  return rows.slice(0, 10_000).map((cells) => {
    const contact: ImportedContact = { externalId: null, username: null, firstName: null, lastName: null, email: null, phone: null, tags: [], fields: {} };
    keys.forEach((key, index) => {
      const value = (cells[index] ?? "").trim();
      if (!value || !key) return;
      const target = ALIASES[key];
      if (target === "tags") contact.tags = value.split(/[|;,]/).map((tag) => tag.trim()).filter(Boolean);
      else if (target === "name") {
        const [first, ...rest] = value.split(/\s+/);
        contact.firstName ??= first ?? null;
        contact.lastName ??= rest.join(" ") || null;
      } else if (target) contact[target] = target === "username" ? value.replace(/^@/, "") : value;
      else contact.fields[key] = value;
    });
    return contact;
  });
}
