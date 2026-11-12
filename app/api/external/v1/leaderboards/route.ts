import { apiKeyRoute } from "@/lib/server/route";
import { getExternalLeaderboards } from "@/lib/server/services/external";

/**
 * Every leaderboard that has started, with each one's ranked participants,
 * for other projects' backends. Contract: docs/EXTERNAL_API.md.
 */
export const GET = apiKeyRoute(({ db, config, now }) =>
  getExternalLeaderboards(db, config, now),
);
