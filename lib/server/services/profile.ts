import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getServerConfig } from "@/lib/server/config";
import { type Db, getDb } from "@/lib/server/db/client";
import { employeePhotos, employees } from "@/lib/server/db/schema";
import { type Identity, upsertEmployee } from "@/lib/server/services/employees";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SYNC_EVERY_MS = 7 * 86_400_000;
const TIMEOUT_MS = 3_000;
const MAX_PHOTO_BYTES = 512 * 1024;

interface GraphProfile {
  givenName?: string | null;
  surname?: string | null;
  department?: string | null;
}

const clean = (value: string | null | undefined) => value?.trim() || null;

/**
 * Copies the employee's first and last name, department and photo from
 * Microsoft Graph (User.Read). At most once every 7 days.
 */
export async function syncProfile(
  db: Db,
  identity: Identity,
  accessToken: string,
  { now = new Date(), fetchImpl = fetch } = {},
): Promise<"synced" | "fresh"> {
  const employee = await upsertEmployee(db, identity);
  if (
    employee.profileSyncedAt &&
    now.getTime() - employee.profileSyncedAt.getTime() < SYNC_EVERY_MS
  )
    return "fresh";

  const headers = { Authorization: `Bearer ${accessToken}` };
  const profileResponse = await fetchImpl(
    `${GRAPH}/me?$select=givenName,surname,department`,
    { headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!profileResponse.ok)
    throw new Error(`Graph /me answered ${profileResponse.status}`);
  const profile = (await profileResponse.json()) as GraphProfile;

  // 404 means the employee has no photo.
  const photoResponse = await fetchImpl(`${GRAPH}/me/photos/120x120/$value`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let photo: { bytes: Uint8Array; contentType: string } | null = null;
  if (photoResponse.ok) {
    const contentType = photoResponse.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await photoResponse.arrayBuffer());
    if (contentType.startsWith("image/") && bytes.length <= MAX_PHOTO_BYTES)
      photo = { bytes, contentType };
  } else if (photoResponse.status !== 404) {
    throw new Error(`Graph photo answered ${photoResponse.status}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({
        givenName: clean(profile.givenName),
        familyName: clean(profile.surname),
        department: clean(profile.department) ?? "",
        profileSyncedAt: now,
      })
      .where(eq(employees.id, employee.id));
    if (photo) {
      const etag = createHash("sha256")
        .update(photo.bytes)
        .digest("hex")
        .slice(0, 16);
      await tx
        .insert(employeePhotos)
        .values({ employeeId: employee.id, ...photo, etag })
        .onConflictDoUpdate({
          target: employeePhotos.employeeId,
          set: { ...photo, etag },
        });
    } else if (photoResponse.status === 404) {
      await tx
        .delete(employeePhotos)
        .where(eq(employeePhotos.employeeId, employee.id));
    }
  });
  return "synced";
}

/**
 * Runs the profile sync after the sign-in response is sent. It never delays
 * or fails sign-in: without a database it does nothing, and errors are logged.
 */
export function scheduleProfileSync(
  identity: Identity,
  accessToken: string | undefined,
) {
  try {
    if (!accessToken || !getServerConfig().databaseUrl) return;
    after(() =>
      syncProfile(getDb(), identity, accessToken).catch((error: unknown) =>
        console.warn("[profile] sync failed", error),
      ),
    );
  } catch (error) {
    console.warn("[profile] sync not scheduled", error);
  }
}
