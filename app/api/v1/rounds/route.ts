import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { getRounds } from "@/lib/server/services/rounds";

/** The challenge window and every weekly and monthly round, for the period menu. */
export const GET = employeeRoute(async ({ db, config }) =>
  json(await getRounds(db, config)),
);
