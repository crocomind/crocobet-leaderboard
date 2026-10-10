import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { after } from "next/server";
import postgres from "postgres";
import { getServerConfig } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";
import * as schema from "./schema";

/** Any Drizzle Postgres database with this schema (postgres.js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Seconds a connection may sit unused before it's closed. Short on purpose:
 * see keepAliveUntilIdleClosed().
 */
const IDLE_SECONDS = 5;

let client: postgres.Sql | undefined;
let db: Db | undefined;

/**
 * Vercel pauses a function instance between requests (Fluid compute). A
 * connection left open while it's paused can die without the client
 * noticing, and the next query sent on it then hangs until the function is
 * killed. So after each request the instance stays up until unused
 * connections have closed themselves, the same thing Vercel's
 * attachDatabasePool() does for `pg` pools. Outside a request it's a no-op.
 */
function keepAliveUntilIdleClosed() {
  try {
    after(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(resolve, IDLE_SECONDS * 1000 + 500),
        ),
    );
  } catch {
    // Not in a request (tests, scripts).
  }
}

/**
 * The app's database. Supabase's transaction pooler (port 6543) doesn't
 * support prepared statements, so they're off.
 */
export function getDb(): Db {
  keepAliveUntilIdleClosed();
  if (db) return db;
  const url = getServerConfig().databaseUrl;
  if (!url)
    throw new HttpError(503, "service_unavailable", "DATABASE_URL is not set");
  client = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: IDLE_SECONDS,
    // Fresh connections now and then, in case one went bad unnoticed.
    max_lifetime: 5 * 60,
    connect_timeout: 10,
  });
  db = drizzle(client, { schema }) as unknown as Db;
  return db;
}

/**
 * Seconds the old connections stay open after resetDb(), so other requests
 * still using them can finish (their reads give up after 20 seconds anyway).
 */
const RESET_GRACE_SECONDS = 30;

/**
 * Switches to fresh connections for the next requests. Used when the
 * database stops answering (a dead connection) instead of letting later
 * requests queue behind it. The old ones aren't closed straight away: other
 * requests running at the same time may still be using healthy ones, and
 * closing them would make those requests fail too.
 */
export function resetDb() {
  const stale = client;
  client = undefined;
  db = undefined;
  if (!stale) return;
  const timer = setTimeout(
    () => void stale.end({ timeout: 0 }).catch(() => {}),
    RESET_GRACE_SECONDS * 1000,
  );
  timer.unref?.();
}
