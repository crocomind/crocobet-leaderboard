import { json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import {
  generateRoundsFor,
  generateSchema,
} from "@/lib/server/services/rounds";

/** Creates weekly or monthly rounds for the whole challenge. */
export const POST = employeeRoute(
  async ({ request, db, config, auth }) => {
    const { kind } = await parseBody(request, generateSchema);
    return json(await generateRoundsFor(db, config, auth.employee, kind), {
      status: 201,
    });
  },
  { admin: true },
);
