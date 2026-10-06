import { json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { bulkModerate, bulkSchema } from "@/lib/server/services/admin";

export const POST = employeeRoute(
  async ({ request, db, auth, now }) =>
    json(
      await bulkModerate(
        db,
        auth.employee,
        await parseBody(request, bulkSchema),
        now,
      ),
    ),
  { admin: true },
);
