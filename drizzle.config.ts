import { defineConfig } from "drizzle-kit";

/**
 * Migrations: `npm run db:generate` after changing lib/server/db/schema.ts,
 * then `npm run db:migrate`. Migrate over a direct or session connection
 * (MIGRATIONS_DATABASE_URL); the app itself uses the transaction pooler.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.MIGRATIONS_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
