import { HttpError, json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import {
  adminPatchSchema,
  deleteAdminPost,
  getAdminPostDetail,
  updateAdminPost,
} from "@/lib/server/services/admin";

function postId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new HttpError(404, "not_found", "Post not found");
  return parsed.data;
}

export const GET = employeeRoute<{ id: string }>(
  async ({ params, db }) =>
    json(await getAdminPostDetail(db, postId(params.id))),
  { admin: true },
);

export const PATCH = employeeRoute<{ id: string }>(
  async ({ request, params, db, config, auth, now }) =>
    json(
      await updateAdminPost(
        db,
        config,
        auth.employee,
        postId(params.id),
        await parseBody(request, adminPatchSchema),
        now,
      ),
    ),
  { admin: true },
);

export const DELETE = employeeRoute<{ id: string }>(
  async ({ params, db }) => {
    await deleteAdminPost(db, postId(params.id));
    return new Response(null, { status: 204 });
  },
  { admin: true },
);
