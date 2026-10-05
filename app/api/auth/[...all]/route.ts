import { toNextJsHandler } from "better-auth/next-js";
import { missingAuthEnv } from "@/lib/auth/config";
import { getAuth } from "@/lib/auth/server";

/** Better Auth endpoints: /api/auth/sign-in/social, /api/auth/callback/microsoft, ... */
function handler(request: Request) {
  const missing = missingAuthEnv();
  if (missing.length > 0) {
    console.error(
      `[auth] Microsoft sign-in is not configured. Missing: ${missing.join(", ")}`,
    );
    return Response.json(
      { error: { code: "auth_not_configured" } },
      { status: 503 },
    );
  }
  const { GET, POST } = toNextJsHandler(getAuth());
  return request.method === "POST" ? POST(request) : GET(request);
}

export { handler as GET, handler as POST };
