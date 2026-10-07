import "server-only";
import { after } from "next/server";
import {
  type AuthenticatedEmployee,
  requireAdmin,
  requireEmployee,
} from "@/lib/server/auth";
import { getServerConfig, type ServerConfig } from "@/lib/server/config";
import { type Db, getDb, resetDb } from "@/lib/server/db/client";
import { assertSameOrigin, handle, HttpError } from "@/lib/server/http";
import { withCampaign } from "@/lib/server/services/rounds";

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

/** Reads give up after this long instead of hanging until Vercel kills the function. */
export const READ_TIMEOUT_MS = 20_000;

/**
 * A read that takes this long is stuck on a dead database connection, not
 * slow: answer 503 (the browser retries once) and drop the connections so the
 * retry gets fresh ones.
 */
function withReadTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.warn("[db] a read timed out; reopening the connections");
      resetDb();
      reject(
        new HttpError(
          503,
          "service_unavailable",
          "The database didn't answer in time",
        ),
      );
    }, READ_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
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
    handle(() => {
      const read = request.method === "GET" || request.method === "HEAD";
      const work = run(request, context);
      return read ? withReadTimeout(work) : work;
    });

  async function run(request: Request, context: { params: Promise<P> }) {
    if (request.method !== "GET" && request.method !== "HEAD")
      assertSameOrigin(request);
    const db = getDb();
    const auth = await requireEmployee(request, db, getServerConfig());
    // The challenge dates admins set in the app win over the server settings.
    const config = await withCampaign(db, getServerConfig());
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
  }
}
