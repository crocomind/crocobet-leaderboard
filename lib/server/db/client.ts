import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { after } from "next/server";
import { Pool } from "pg";
import { getServerConfig } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";
import * as schema from "./schema";

/** Any Drizzle Postgres database with this schema (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Seconds a connection may sit unused before it's closed. Short on purpose:
 * see keepAliveUntilIdleClosed().
 */
const IDLE_SECONDS = 5;

let pool: Pool | undefined;
let db: Db | undefined;

/**
 * Vercel pauses a function instance between requests (Fluid compute). A
 * connection left open while it's paused can die without the client
 * noticing, and the next query sent on it then hangs until the function is
 * killed. So after each request the instance stays up until unused
 * connections have closed themselves, the same thing Vercel's
 * attachDatabasePool() does. Outside a request it's a no-op.
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
 * The app's database, through Supabase's transaction pooler (port 6543).
 *
 * node-postgres, not postgres.js: postgres.js pipelines queries (sends more
 * down a connection that's still busy) whenever a request runs more queries
 * at once than there are connections, and Supavisor in transaction mode
 * loses track of pipelined queries: the query never answers and every one
 * behind it on that connection hangs. Pipelining can't be turned off there
 * without breaking transactions. node-postgres runs one query per connection
 * at a time and sends each in one round trip, without prepared statements
 * (which the transaction pooler doesn't support).
 */
export function getDb(): Db {
  keepAliveUntilIdleClosed();
  if (db) return db;
  const url = getServerConfig().databaseUrl;
  if (!url)
    throw new HttpError(503, "service_unavailable", "DATABASE_URL is not set");
  pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: IDLE_SECONDS * 1000,
    // Fresh connections now and then, in case one went bad unnoticed.
    maxLifetimeSeconds: 5 * 60,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // An idle connection that drops emits "error" on the pool; unhandled, it
  // would crash the instance. The pool replaces the connection by itself.
  pool.on("error", (error) =>
    console.warn("[db] an idle connection failed", error.message),
  );
  db = drizzle(pool, { schema }) as unknown as Db;
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
  const stale = pool;
  pool = undefined;
  db = undefined;
  if (!stale) return;
  const timer = setTimeout(
    () => void stale.end().catch(() => {}),
    RESET_GRACE_SECONDS * 1000,
  );
  timer.unref?.();
}
