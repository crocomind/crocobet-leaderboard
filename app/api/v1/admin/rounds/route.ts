import { json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { createRound, roundInputSchema } from "@/lib/server/services/rounds";

export const POST = employeeRoute(
  async ({ request, db, config, auth }) =>
    json(
      await createRound(
        db,
        config,
        auth.employee,
        await parseBody(request, roundInputSchema),
      ),
      { status: 201 },
    ),
  { admin: true },
);
