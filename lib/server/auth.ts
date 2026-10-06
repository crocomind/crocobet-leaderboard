import "server-only";
import { allowedEmailDomains, isAuthConfigured } from "@/lib/auth/config";
import { isAllowedEmail } from "@/lib/auth/policy";
import { getAuth } from "@/lib/auth/server";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import type { EmployeeRow } from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import { isAdmin, upsertEmployee } from "@/lib/server/services/employees";

export interface AuthenticatedEmployee {
  employee: EmployeeRow;
  isAdmin: boolean;
}

/**
 * Every /api/v1 handler calls this itself, even though proxy.ts already
 * answers signed-out API calls with a 401. It re-checks the email domain and
 * creates or updates the employee row.
 */
export async function requireEmployee(
  request: Request,
  db: Db,
  config: ServerConfig,
): Promise<AuthenticatedEmployee> {
  if (!isAuthConfigured())
    throw new HttpError(401, "unauthorized", "Sign-in isn't configured");
  const session = await getAuth()
    .api.getSession({ headers: request.headers })
    .catch(() => null);
  const user = session?.user;
  if (!user) throw new HttpError(401, "unauthorized", "Not signed in");
  if (!isAllowedEmail(user.email, allowedEmailDomains()))
    throw new HttpError(403, "forbidden", "Not a Crocobet account");

  const employee = await upsertEmployee(db, {
    oid: typeof user.entraOid === "string" ? user.entraOid : null,
    email: user.email,
    name: user.name,
  });
  return { employee, isAdmin: isAdmin(employee, config) };
}

export function requireAdmin(auth: AuthenticatedEmployee) {
  if (!auth.isAdmin) throw new HttpError(403, "forbidden", "Admins only");
}
