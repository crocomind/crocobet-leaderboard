import { parseQuery } from "@/lib/server/http";
import { apiKeyRoute } from "@/lib/server/route";
import { externalStandingsQuerySchema } from "@/lib/server/schemas";
import { getExternalStandings } from "@/lib/server/services/external";

/**
 * One leaderboard's standings, with emails, for other projects' backends.
 * Contract: docs/EXTERNAL_API.md.
 */
export const GET = apiKeyRoute(({ request, db, config, now }) =>
  getExternalStandings(
    db,
    config,
    parseQuery(request, externalStandingsQuerySchema),
    now,
  ),
);
