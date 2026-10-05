import { HttpError } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import { refreshAdminPost } from "@/lib/server/services/admin";

/** The post check runs a scraper, which can take minutes (after() shares this limit). */
export const maxDuration = 300;

export const POST = employeeRoute<{ id: string }>(
  async ({ params, db, config, auth, now }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw new HttpError(404, "not_found", "Post not found");
    await refreshAdminPost(db, config, auth.employee, id.data, now);
    return new Response(null, { status: 202 });
  },
  { admin: true },
);
