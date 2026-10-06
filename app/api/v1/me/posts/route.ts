import { json } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { getMyPosts } from "@/lib/server/services/posts";

export const GET = employeeRoute(async (context) =>
  json(await getMyPosts(context, context.auth.employee)),
);
