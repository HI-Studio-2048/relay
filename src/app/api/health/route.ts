import { hasDatabaseUrl, hasRedisUrl, workerMode } from "@/lib/env";
import { json } from "@/lib/http";

export async function GET() {
  return json({
    ok: true,
    service: "relay",
    workerMode: workerMode(),
    database: hasDatabaseUrl() ? "postgres" : "pglite",
    redis: hasRedisUrl() ? "redis" : "memory",
  });
}
