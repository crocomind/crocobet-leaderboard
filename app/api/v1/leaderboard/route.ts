import { json, parseQuery } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { leaderboardQuerySchema } from "@/lib/server/schemas";
import { getLeaderboard } from "@/lib/server/services/leaderboard";

export const GET = employeeRoute(async ({ request, db, config, auth, now }) =>
  json(
    await getLeaderboard(
      db,
      config,
      parseQuery(request, leaderboardQuerySchema),
      auth.employee.id,
      now,
    ),
  ),
);
