import { json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import {
  challengeInputSchema,
  updateChallenge,
} from "@/lib/server/services/rounds";

/** The challenge's first and last day, set by admins. */
export const PUT = employeeRoute(
  async ({ request, db, config, auth }) =>
    json(
      await updateChallenge(
        db,
        config,
        auth.employee,
        await parseBody(request, challengeInputSchema),
      ),
    ),
  { admin: true },
);
