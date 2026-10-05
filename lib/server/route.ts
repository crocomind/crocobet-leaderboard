import "server-only";
import { after } from "next/server";
import {
  type AuthenticatedEmployee,
  requireAdmin,
  requireEmployee,
} from "@/lib/server/auth";
import { getServerConfig, type ServerConfig } from "@/lib/server/config";
import { type Db, getDb } from "@/lib/server/db/client";
import { assertSameOrigin, handle } from "@/lib/server/http";

export interface RouteContext<P> {
  request: Request;
  params: P;
  db: Db;
  config: ServerConfig;
  auth: AuthenticatedEmployee;
  now: Date;
  /** Work that runs after the response is sent. */
  defer: (task: () => Promise<unknown>) => void;
  clock: () => Date;
}

/**
 * Wraps an /api/v1 handler: writes must be same-origin, every request needs
 * a signed-in employee (admins only with `admin: true`), and errors become
 * the error envelope.
 */
export function employeeRoute<
  P extends Record<string, string> = Record<string, never>,
>(
  handler: (context: RouteContext<P>) => Promise<Response>,
  { admin = false }: { admin?: boolean } = {},
) {
  return (request: Request, context: { params: Promise<P> }) =>
    handle(async () => {
      if (request.method !== "GET" && request.method !== "HEAD")
        assertSameOrigin(request);
      const config = getServerConfig();
      const db = getDb();
      const auth = await requireEmployee(request, db, config);
      if (admin) requireAdmin(auth);
      return handler({
        request,
        params: await context.params,
        db,
        config,
        auth,
        now: new Date(),
        clock: () => new Date(),
        defer: (task) =>
          after(() =>
            task().catch((error: unknown) =>
              console.error("[api] background task failed", error),
            ),
          ),
      });
    });
}
