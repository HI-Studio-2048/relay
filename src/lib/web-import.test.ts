import { describe, expect, it } from "vitest";
import { checkImportUrl, htmlToText, isPublicAddress } from "@/lib/web-import";

describe("knowledge import", () => {
  it("turns html into readable text", () => {
    const text = htmlToText("<html><head><title>Shop</title><style>p{}</style></head><body><h1>Prices</h1><p>Tee &amp; cap: $29</p><script>x()</script></body></html>");
    expect(text).toBe("Shop\nPrices\nTee & cap: $29");
  });

  it("blocks private and special addresses in production", () => {
    for (const url of [
      "http://example.com",
      "https://localhost:3000",
      "https://localhost./",
      "https://metadata.google.internal./",
      "https://10.0.0.5/",
      "https://192.168.1.1/",
      "https://100.100.100.200/",
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:a9fe:a9fe]/",
      "https://[::]/",
      "https://[::127.0.0.1]/",
      "https://[64:ff9b::7f00:1]/",
      "https://[fe90::1]/",
      "https://[fd00::1]/",
      "https://user:pw@example.com/",
      "ftp://example.com",
    ]) {
      expect(() => checkImportUrl(url, false), url).toThrow();
    }
    expect(checkImportUrl("https://example.com/faq", false).hostname).toBe("example.com");
  });

  it("classifies resolved addresses", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
    for (const ip of ["127.0.0.1", "169.254.169.254", "172.16.0.1", "0.0.0.0", "224.0.0.1", "::1", "::ffff:10.0.0.1", "fc00::1", "ff02::1", "2001:db8::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});
