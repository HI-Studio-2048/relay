import { describe, expect, it } from "vitest";
import { redirectTo, relativeLocation } from "@/lib/http";

describe("redirectTo", () => {
  it("answers with a relative 303 so the server's own address never leaks", () => {
    const response = redirectTo("/channels", "error", "Could not connect & retry");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/channels?error=Could+not+connect+%26+retry");
  });

  it("keeps a query that is already part of the path", () => {
    expect(relativeLocation("/broadcasts/abc?queued=1")).toBe("/broadcasts/abc?queued=1");
  });
});
