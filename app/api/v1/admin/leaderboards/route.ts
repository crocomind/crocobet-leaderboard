import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { listLeaderboards } from "@/lib/server/services/boards";

/** The challenge and every round, with participant counts. */
export const GET = employeeRoute(
  async ({ db, config, now }) => json(await listLeaderboards(db, config, now)),
  { admin: true },
);
