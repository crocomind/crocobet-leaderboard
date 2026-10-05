import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { toMe } from "@/lib/server/services/employees";

export const GET = employeeRoute(async ({ db, config, auth }) =>
  json(await toMe(db, auth.employee, config)),
);
