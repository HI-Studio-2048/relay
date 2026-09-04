function isProd() {
  return process.env.NODE_ENV === "production";
}

export function workerMode(): "web" | "worker" | "all" {
  const raw = (process.env.WORKER_MODE ?? "all").toLowerCase();
  if (raw === "web" || raw === "worker" || raw === "all") return raw;
  return "all";
}

export function publicUrl(requestUrl?: string): string | null {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (requestUrl) {
    const url = new URL(requestUrl);
    return url.origin;
  }
  return null;
}

export function telegramSendsPerSecond(): number {
  const n = Number(process.env.TELEGRAM_SENDS_PER_SECOND ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.min(25, Math.max(1, Math.floor(n)));
}

export function requireEncryptionInProd() {
  if (isProd() && !process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is required in production");
  }
}

export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function hasRedisUrl() {
  return Boolean(process.env.REDIS_URL);
}
