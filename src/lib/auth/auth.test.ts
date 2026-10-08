import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "plaintext")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips the user id", () => {
    expect(verifySessionToken(createSessionToken("user-1"))).toBe("user-1");
  });

  it("rejects tampered and expired tokens", () => {
    const token = createSessionToken("user-1", 0);
    expect(verifySessionToken(token)).toBeNull();
    const [, expires, sig] = createSessionToken("user-1").split(".");
    expect(verifySessionToken(`user-2.${expires}.${sig}`)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});
