import { json, parseBody } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { submitPost, submitPostSchema } from "@/lib/server/services/posts";

export const POST = employeeRoute(async (context) => {
  const payload = await parseBody(context.request, submitPostSchema);
  const post = await submitPost(context, context.auth.employee, payload);
  return json(post, { status: 201 });
});
