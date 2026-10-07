import { boardParam } from "@/lib/server/board-params";
import { parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import {
  exclusionInputSchema,
  removeFromLeaderboard,
} from "@/lib/server/services/boards";

/** Takes someone off this leaderboard; their posts still count on the others. */
export const POST = employeeRoute<{ board: string }>(
  async ({ request, params, db, config, auth, now }) => {
    const { employeeId } = await parseBody(request, exclusionInputSchema);
    await removeFromLeaderboard(
      db,
      config,
      auth.employee,
      boardParam(params.board),
      employeeId,
      now,
    );
    return new Response(null, { status: 204 });
  },
  { admin: true },
);
