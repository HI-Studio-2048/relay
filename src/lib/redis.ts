import Redis from "ioredis";
import { hasRedisUrl } from "@/lib/env";
import { log } from "@/lib/logger";

type MemoryRedis = {
  kind: "memory";
  lists: Map<string, string[]>;
  kv: Map<string, { value: string; expiresAt?: number }>;
};

type GlobalRedis = {
  relayRedis?: Redis | MemoryRedis;
};

const globalForRedis = globalThis as unknown as GlobalRedis;

function memory(): MemoryRedis {
  return { kind: "memory", lists: new Map(), kv: new Map() };
}

export function getRedis(): Redis | MemoryRedis {
  if (globalForRedis.relayRedis) return globalForRedis.relayRedis;
  if (hasRedisUrl()) {
    const client = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2, lazyConnect: true });
    client.on("error", (error) => log.warn("Redis error", error.message));
    globalForRedis.relayRedis = client;
    log.info("Connected to Redis");
    return client;
  }
  globalForRedis.relayRedis = memory();
  log.info("Using in-memory Redis fallback (set REDIS_URL for shared queues)");
  return globalForRedis.relayRedis;
}

export function isMemoryRedis(client: Redis | MemoryRedis): client is MemoryRedis {
  return "kind" in client && client.kind === "memory";
}

export async function lpush(key: string, value: string) {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    const list = client.lists.get(key) ?? [];
    list.unshift(value);
    client.lists.set(key, list);
    return list.length;
  }
  return client.lpush(key, value);
}

export async function rpop(key: string): Promise<string | null> {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    const list = client.lists.get(key) ?? [];
    const value = list.pop() ?? null;
    client.lists.set(key, list);
    return value;
  }
  return client.rpop(key);
}

export async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    const now = Date.now();
    const current = client.kv.get(key);
    if (!current || (current.expiresAt && current.expiresAt < now)) {
      client.kv.set(key, { value: "1", expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(current.value) + 1;
    client.kv.set(key, { ...current, value: String(next) });
    return next;
  }
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, ttlSeconds);
  return count;
}

export async function getTtlValue(key: string): Promise<string | null> {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    const current = client.kv.get(key);
    if (!current) return null;
    if (current.expiresAt && current.expiresAt < Date.now()) {
      client.kv.delete(key);
      return null;
    }
    return current.value;
  }
  return client.get(key);
}

export async function setTtlValue(key: string, value: string, ttlSeconds: number) {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    client.kv.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  await client.set(key, value, "EX", ttlSeconds);
}

export async function delKey(key: string) {
  const client = getRedis();
  if (isMemoryRedis(client)) {
    client.kv.delete(key);
    return;
  }
  await client.del(key);
}
