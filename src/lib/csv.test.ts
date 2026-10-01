import { describe, expect, it } from "vitest";
import { contactsFromCsv, parseCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quotes, escaped quotes, CRLF and embedded newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["multi\nline", "z"],
    ]);
  });

  it("maps headers to contacts and keeps unknown columns as fields", () => {
    const rows = contactsFromCsv("﻿Name,E-mail,Phone Number,Tags,Company,Handle\nAda Lovelace,ada@x.com,+1 555,vip|lead,Acme,@ada\n,,,,,\n");
    expect(rows).toEqual([
      {
        externalId: null,
        username: "ada",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@x.com",
        phone: "+1 555",
        tags: ["vip", "lead"],
        fields: { company: "Acme" },
      },
    ]);
  });
});
