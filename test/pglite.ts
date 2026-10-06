import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/server/db/client";
import * as schema from "@/lib/server/db/schema";

/** A fresh in-memory Postgres (PGlite) with the real migrations applied. */
export async function createTestDb(): Promise<{
  db: Db;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}
