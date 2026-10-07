import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { listParticipants } from "@/lib/server/services/boards";

/** Everyone who has submitted a post, with their challenge standing. */
export const GET = employeeRoute(
  async ({ db, config, now }) => json(await listParticipants(db, config, now)),
  { admin: true },
);
