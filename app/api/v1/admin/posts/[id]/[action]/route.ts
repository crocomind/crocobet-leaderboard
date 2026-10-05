import { z } from "zod";
import { ADMIN_ACTIONS } from "@/lib/moderation";
import { HttpError, json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import { moderatePost, moderationSchema } from "@/lib/server/services/admin";

const actionSchema = z.enum(ADMIN_ACTIONS);

/** POST /admin/posts/{id}/{approve|reject|disqualify|reinstate|reopen} */
export const POST = employeeRoute<{ id: string; action: string }>(
  async ({ request, params, db, auth, now }) => {
    const id = uuidSchema.safeParse(params.id);
    const action = actionSchema.safeParse(params.action);
    if (!id.success || !action.success)
      throw new HttpError(404, "not_found", "Not found");
    return json(
      await moderatePost(
        db,
        auth.employee,
        id.data,
        action.data,
        await parseBody(request, moderationSchema),
        now,
      ),
    );
  },
  { admin: true },
);
