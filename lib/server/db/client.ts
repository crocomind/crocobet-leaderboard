import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerConfig } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";
import * as schema from "./schema";

/** Any Drizzle Postgres database with this schema (postgres.js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

/**
 * The app's database. Supabase's transaction pooler (port 6543) doesn't
 * support prepared statements, so they're off.
 */
export function getDb(): Db {
  if (db) return db;
  const url = getServerConfig().databaseUrl;
  if (!url)
    throw new HttpError(503, "service_unavailable", "DATABASE_URL is not set");
  const client = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  db = drizzle(client, { schema }) as unknown as Db;
  return db;
}
