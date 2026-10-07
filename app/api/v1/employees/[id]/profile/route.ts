import { employeeParam } from "@/lib/server/board-params";
import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { getProfile } from "@/lib/server/services/boards";

/** Leaderboard history: your own, or anyone's for an admin. */
export const GET = employeeRoute<{ id: string }>(
  async ({ params, db, config, auth, now }) =>
    json(await getProfile(db, config, auth, employeeParam(params.id), now)),
);
