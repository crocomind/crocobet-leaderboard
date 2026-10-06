import { HttpError, json, parseQuery } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { boardQuerySchema, uuidSchema } from "@/lib/server/schemas";
import { getEmployeePosts } from "@/lib/server/services/posts";

export const GET = employeeRoute<{ id: string }>(async (context) => {
  const id = uuidSchema.safeParse(context.params.id);
  if (!id.success) throw new HttpError(404, "not_found", "Employee not found");
  return json(
    await getEmployeePosts(
      context,
      id.data,
      parseQuery(context.request, boardQuerySchema),
    ),
  );
});
