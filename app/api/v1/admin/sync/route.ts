import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { getSyncStatus, startManualSync } from "@/lib/server/services/admin";

export const maxDuration = 300;

export const GET = employeeRoute(
  async ({ db }) => json(await getSyncStatus(db)),
  {
    admin: true,
  },
);

export const POST = employeeRoute(
  async ({ db, config, now, defer }) =>
    json(await startManualSync(db, config, now, defer), { status: 202 }),
  { admin: true },
);
