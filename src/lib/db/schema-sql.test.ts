import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { MIGRATION_SQL } from "@/lib/db/sql";

/** Every column Drizzle writes must exist in the hand-written migration, or inserts fail at runtime. */
describe("schema matches migration SQL", () => {
  const tables = Object.values(schema).filter((value): value is PgTable => value instanceof PgTable);

  it("has tables to check", () => {
    expect(tables.length).toBeGreaterThan(10);
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    it(config.name, () => {
      const sql = MIGRATION_SQL.toLowerCase();
      const create = sql.match(new RegExp(`create table if not exists ${config.name} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
      expect(create, `CREATE TABLE ${config.name}`).not.toBe("");
      const missing = config.columns
        .map((column) => column.name)
        .filter(
          (name) =>
            !new RegExp(`^\\s*${name}\\s`, "m").test(create) &&
            !sql.includes(`alter table ${config.name} add column if not exists ${name} `),
        );
      expect(missing).toEqual([]);
    });
  }
});
