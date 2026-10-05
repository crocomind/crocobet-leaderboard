import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { Employee, Me } from "@/lib/api/types";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  employeePhotos,
  employees,
  type EmployeeRow,
} from "@/lib/server/db/schema";

/** Who signed in, as Microsoft says. */
export interface Identity {
  /** The Entra object ID; null if the session doesn't carry it. */
  oid: string | null;
  email: string;
  name: string;
}

/**
 * Finds or creates the employee for a signed-in identity. Keyed on the Entra
 * oid (stable across sign-ins and email changes), falling back to the
 * lowercase email; the oid is stored once it's known.
 */
export async function upsertEmployee(
  db: Db,
  identity: Identity,
): Promise<EmployeeRow> {
  const email = identity.email.trim().toLowerCase();
  const displayName = identity.name.trim() || email;

  const byOid = identity.oid
    ? await db.query.employees.findFirst({
        where: eq(employees.entraOid, identity.oid),
      })
    : undefined;
  const existing =
    byOid ??
    (await db.query.employees.findFirst({ where: eq(employees.email, email) }));

  if (existing) {
    const changes: Partial<EmployeeRow> = {};
    if (existing.email !== email) changes.email = email;
    if (existing.displayName !== displayName) changes.displayName = displayName;
    if (identity.oid && existing.entraOid !== identity.oid)
      changes.entraOid = identity.oid;
    if (Object.keys(changes).length === 0) return existing;
    const [updated] = await db
      .update(employees)
      .set(changes)
      .where(eq(employees.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  // Two first requests can race; the email key settles it.
  const [created] = await db
    .insert(employees)
    .values({ email, displayName, entraOid: identity.oid })
    .onConflictDoUpdate({
      target: employees.email,
      set: {
        displayName,
        entraOid: sql`coalesce(${employees.entraOid}, excluded.entra_oid)`,
      },
    })
    .returning();
  if (!created) throw new Error("Couldn't create the employee");
  return created;
}

export function isAdmin(employee: EmployeeRow, config: ServerConfig): boolean {
  return (
    employee.role === "admin" || config.adminEmails.includes(employee.email)
  );
}

export function displayName(
  employee: Pick<EmployeeRow, "givenName" | "familyName" | "displayName">,
): string {
  return employee.givenName && employee.familyName
    ? `${employee.givenName} ${employee.familyName}`
    : employee.displayName;
}

export function photoUrl(
  employeeId: string,
  etag: string | null,
): string | null {
  return etag
    ? `/api/v1/employees/${employeeId}/photo?v=${encodeURIComponent(etag)}`
    : null;
}

/** The public profile: never includes the email. */
export function toEmployee(
  employee: EmployeeRow,
  photoEtag: string | null,
): Employee {
  return {
    id: employee.id,
    name: displayName(employee),
    firstName: employee.givenName,
    lastName: employee.familyName,
    department: employee.department,
    avatarUrl: photoUrl(employee.id, photoEtag),
  };
}

export async function photoEtagOf(db: Db, employeeId: string) {
  const [row] = await db
    .select({ etag: employeePhotos.etag })
    .from(employeePhotos)
    .where(eq(employeePhotos.employeeId, employeeId));
  return row?.etag ?? null;
}

export async function toMe(
  db: Db,
  employee: EmployeeRow,
  config: ServerConfig,
): Promise<Me> {
  return {
    ...toEmployee(employee, await photoEtagOf(db, employee.id)),
    email: employee.email,
    role: isAdmin(employee, config) ? "admin" : "employee",
  };
}

/** Public profiles for these employees, keyed by id. */
export async function loadEmployees(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, Employee>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ employee: employees, etag: employeePhotos.etag })
    .from(employees)
    .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
    .where(inArray(employees.id, [...new Set(ids)]));
  return new Map(
    rows.map(({ employee, etag }) => [employee.id, toEmployee(employee, etag)]),
  );
}
