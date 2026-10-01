import { describe, expect, it } from "vitest";
import { checkImportUrl, htmlToText } from "@/lib/web-import";

describe("knowledge import", () => {
  it("turns html into readable text", () => {
    const text = htmlToText("<html><head><title>Shop</title><style>p{}</style></head><body><h1>Prices</h1><p>Tee &amp; cap: $29</p><script>x()</script></body></html>");
    expect(text).toBe("Shop\nPrices\nTee & cap: $29");
  });

  it("blocks private addresses in production", () => {
    expect(() => checkImportUrl("http://localhost:3000", false)).toThrow();
    expect(() => checkImportUrl("https://10.0.0.5/", false)).toThrow();
    expect(() => checkImportUrl("https://192.168.1.1/", false)).toThrow();
    expect(() => checkImportUrl("ftp://example.com", false)).toThrow();
    expect(checkImportUrl("https://example.com/faq", false).hostname).toBe("example.com");
  });
});
