import { json, parseQuery } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import {
  adminPostsQuerySchema,
  listAdminPosts,
} from "@/lib/server/services/admin";

export const GET = employeeRoute(
  async ({ request, db }) => {
    const { cursor, ...query } = parseQuery(request, adminPostsQuerySchema);
    return json(await listAdminPosts(db, query, cursor ?? null));
  },
  { admin: true },
);
