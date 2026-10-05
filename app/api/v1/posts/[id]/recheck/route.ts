import { HttpError } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import { recheckPost } from "@/lib/server/services/posts";

export const POST = employeeRoute<{ id: string }>(async (context) => {
  const id = uuidSchema.safeParse(context.params.id);
  if (!id.success) throw new HttpError(404, "not_found", "Post not found");
  await recheckPost(
    context,
    context.auth.employee,
    context.auth.isAdmin,
    id.data,
  );
  return new Response(null, { status: 202 });
});
