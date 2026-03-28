import type { DB } from "./types/database.js";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import Config from "./config.js";

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: Config.DATABASE_URL,
    }),
  }),
});

export enum DbErrorCode {
  UNIQUE_VIOLATION = "23505",
}

export function isDbError(
  err: unknown,
): err is { code: string; constraint?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function checkDb() {
  await db
    .selectFrom("extensions.pg_stat_statements")
    .select("dbid")
    .limit(1)
    .execute();
}
