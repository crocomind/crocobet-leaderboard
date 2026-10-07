import { z } from "zod";
import { boardParam } from "@/lib/server/board-params";
import { json, parseQuery } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { CONTENT_CATEGORIES } from "@/lib/platforms";
import { getLeaderboardDetail } from "@/lib/server/services/boards";

const querySchema = z.object({
  category: z.enum(CONTENT_CATEGORIES).default("video"),
});

/** A leaderboard's ranked participants and the people taken off it. */
export const GET = employeeRoute<{ board: string }>(
  async ({ request, params, db, config, now }) =>
    json(
      await getLeaderboardDetail(
        db,
        config,
        boardParam(params.board),
        parseQuery(request, querySchema).category,
        now,
      ),
    ),
  { admin: true },
);
