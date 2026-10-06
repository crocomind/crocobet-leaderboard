import { HttpError, json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import {
  deleteRound,
  roundPatchSchema,
  updateRound,
} from "@/lib/server/services/rounds";

function roundId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new HttpError(404, "not_found", "Round not found");
  return parsed.data;
}

export const PATCH = employeeRoute<{ id: string }>(
  async ({ request, params, db, config }) =>
    json(
      await updateRound(
        db,
        config,
        roundId(params.id),
        await parseBody(request, roundPatchSchema),
      ),
    ),
  { admin: true },
);

export const DELETE = employeeRoute<{ id: string }>(
  async ({ params, db }) => {
    await deleteRound(db, roundId(params.id));
    return new Response(null, { status: 204 });
  },
  { admin: true },
);
