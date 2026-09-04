import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEncryptionInProd } from "@/lib/env";

const DEV_KEY = Buffer.from("dev-only-relay-encryption-key-32"); // 32 bytes

function encryptionKey(): Buffer {
  requireEncryptionInProd();
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return DEV_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const utf = Buffer.from(raw, "utf8");
  if (utf.length === 32) return utf;
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // fall through
  }
  throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars, base64, or utf8)");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function randomSecret(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function signAdminSession(password: string): string {
  return createHmac("sha256", password).update("relay-admin-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function redactSecrets(value: string): string {
  return value.replace(/\d{8,}:[A-Za-z0-9_-]{20,}/g, "[redacted-bot-token]");
}
