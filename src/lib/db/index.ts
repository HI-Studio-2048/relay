import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { MIGRATION_SQL } from "@/lib/db/sql";
import { hasDatabaseUrl } from "@/lib/env";
import { log } from "@/lib/logger";

export type AppDb = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

type GlobalDb = {
  relayDb?: AppDb;
  relayMigrated?: boolean;
  relayPg?: ReturnType<typeof postgres>;
  relayPglite?: PGlite;
};

const globalForDb = globalThis as unknown as GlobalDb;

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part};`);
}

async function runMigrations(exec: (sql: string) => Promise<unknown>) {
  if (globalForDb.relayMigrated) return;
  for (const statement of splitStatements(MIGRATION_SQL)) {
    await exec(statement);
  }
  globalForDb.relayMigrated = true;
}

export async function getDb(): Promise<AppDb> {
  if (globalForDb.relayDb) return globalForDb.relayDb;

  if (hasDatabaseUrl()) {
    const client = postgres(process.env.DATABASE_URL!, { max: 8, idle_timeout: 20 });
    globalForDb.relayPg = client;
    const db = drizzlePg(client, { schema });
    await runMigrations((sql) => client.unsafe(sql));
    globalForDb.relayDb = db;
    log.info("Connected to Postgres");
    return db;
  }

  const dataDir = path.join(process.cwd(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(path.join(dataDir, "relay"));
  globalForDb.relayPglite = client;
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await runMigrations((sql) => client.exec(sql));
  globalForDb.relayDb = db;
  log.info("Using file-backed PGlite (set DATABASE_URL for Postgres)");
  return db;
}
