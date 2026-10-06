import { HttpError } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import { withdrawPost } from "@/lib/server/services/posts";

export const DELETE = employeeRoute<{ id: string }>(
  async ({ params, db, auth }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw new HttpError(404, "not_found", "Post not found");
    await withdrawPost(db, auth.employee, id.data);
    return new Response(null, { status: 204 });
  },
);
