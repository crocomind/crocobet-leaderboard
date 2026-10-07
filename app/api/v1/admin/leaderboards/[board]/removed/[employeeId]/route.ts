import { boardParam, employeeParam } from "@/lib/server/board-params";
import { employeeRoute } from "@/lib/server/route";
import { restoreToLeaderboard } from "@/lib/server/services/boards";

/** Puts someone back on this leaderboard. */
export const DELETE = employeeRoute<{ board: string; employeeId: string }>(
  async ({ params, db, config, now }) => {
    await restoreToLeaderboard(
      db,
      config,
      boardParam(params.board),
      employeeParam(params.employeeId),
      now,
    );
    return new Response(null, { status: 204 });
  },
  { admin: true },
);
