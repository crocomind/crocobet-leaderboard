import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, resetDb, testConfig } from "@/test/factories";
import type { Db } from "@/lib/server/db/client";
import { employeePhotos, employees } from "@/lib/server/db/schema";
import {
  isAdmin,
  loadEmployees,
  toMe,
  upsertEmployee,
} from "@/lib/server/services/employees";
import { syncProfile } from "@/lib/server/services/profile";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const oid = "0f0e0d0c-0000-4000-8000-000000000001";

describe("upsertEmployee", () => {
  it("creates the employee once, keyed on the Entra oid", async () => {
    const first = await upsertEmployee(db, {
      oid,
      email: "Ana.Gelashvili@Crocobet.com",
      name: "Ana Gelashvili",
    });
    const again = await upsertEmployee(db, {
      oid,
      email: "ana.gelashvili@crocobet.com",
      name: "Ana Gelashvili",
    });
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({
      entraOid: oid,
      email: "ana.gelashvili@crocobet.com",
      displayName: "Ana Gelashvili",
      role: "employee",
    });
    expect(await db.select().from(employees)).toHaveLength(1);
  });

  it("follows an email change through the oid", async () => {
    const before = await upsertEmployee(db, {
      oid,
      email: "ana.old@crocobet.com",
      name: "Ana",
    });
    const after = await upsertEmployee(db, {
      oid,
      email: "ana.new@crocobet.com",
      name: "Ana G.",
    });
    expect(after).toMatchObject({
      id: before.id,
      email: "ana.new@crocobet.com",
      displayName: "Ana G.",
    });
  });

  it("finds a row created before the oid was known and stores the oid", async () => {
    const before = await upsertEmployee(db, {
      oid: null,
      email: "nino@crocobet.com",
      name: "Nino",
    });
    expect(before.entraOid).toBeNull();
    const after = await upsertEmployee(db, {
      oid,
      email: "nino@crocobet.com",
      name: "Nino",
    });
    expect(after).toMatchObject({ id: before.id, entraOid: oid });
  });
});

describe("admins and public profiles", () => {
  it("treats ADMIN_EMAILS and the admin role as admins", async () => {
    const boss = await makeEmployee(db, { email: "boss@crocobet.com" });
    const role = await makeEmployee(db, { role: "admin" });
    const plain = await makeEmployee(db);
    expect(
      [boss, role, plain].map((employee) => isAdmin(employee, testConfig)),
    ).toEqual([true, true, false]);
    expect((await toMe(db, boss, testConfig)).role).toBe("admin");
    expect((await toMe(db, plain, testConfig)).role).toBe("employee");
  });

  it("shows first and last name and a cache-busted photo URL, never the email", async () => {
    const ana = await makeEmployee(db, {
      email: "ana@crocobet.com",
      displayName: "Ana (Marketing)",
      givenName: "Ana",
      familyName: "Gelashvili",
      department: "Marketing",
    });
    await db.insert(employeePhotos).values({
      employeeId: ana.id,
      contentType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
      etag: "abc123",
    });
    const plain = await makeEmployee(db, { displayName: "Just A Name" });
    const map = await loadEmployees(db, [ana.id, plain.id]);
    expect(map.get(ana.id)).toEqual({
      id: ana.id,
      name: "Ana Gelashvili",
      firstName: "Ana",
      lastName: "Gelashvili",
      department: "Marketing",
      avatarUrl: `/api/v1/employees/${ana.id}/photo?v=abc123`,
    });
    expect(map.get(plain.id)).toMatchObject({
      name: "Just A Name",
      avatarUrl: null,
    });
    expect(JSON.stringify([...map.values()])).not.toContain("@");
  });
});

describe("syncProfile", () => {
  const identity = { oid, email: "ana@crocobet.com", name: "Ana" };
  const graph = (photo: Response | null) => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      if (String(url).includes("/photos/"))
        return photo ?? new Response(null, { status: 404 });
      return Response.json({
        givenName: "Ana",
        surname: "Gelashvili",
        department: "Marketing",
      });
    }) as typeof fetch;
    return { fetchImpl, calls };
  };

  it("stores the name, department and photo from Microsoft Graph", async () => {
    const { fetchImpl, calls } = graph(
      new Response(new Uint8Array([9, 8, 7]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    expect(await syncProfile(db, identity, "token", { fetchImpl })).toBe(
      "synced",
    );
    expect(calls).toEqual([
      "https://graph.microsoft.com/v1.0/me?$select=givenName,surname,department",
      "https://graph.microsoft.com/v1.0/me/photos/120x120/$value",
    ]);
    const row = await db.query.employees.findFirst({
      where: eq(employees.entraOid, oid),
    });
    expect(row).toMatchObject({
      givenName: "Ana",
      familyName: "Gelashvili",
      department: "Marketing",
    });
    const [photo] = await db.select().from(employeePhotos);
    expect(photo?.contentType).toBe("image/jpeg");
    expect([...(photo?.bytes ?? [])]).toEqual([9, 8, 7]);
  });

  it("syncs at most once a week, and removes a photo that's gone", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    const withPhoto = graph(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "image/png" },
      }),
    );
    await syncProfile(db, identity, "token", {
      now,
      fetchImpl: withPhoto.fetchImpl,
    });
    const soon = graph(null);
    expect(
      await syncProfile(db, identity, "token", {
        now: new Date(now.getTime() + 86_400_000),
        fetchImpl: soon.fetchImpl,
      }),
    ).toBe("fresh");
    expect(soon.calls).toEqual([]);
    await syncProfile(db, identity, "token", {
      now: new Date(now.getTime() + 8 * 86_400_000),
      fetchImpl: soon.fetchImpl,
    });
    expect(await db.select().from(employeePhotos)).toEqual([]);
  });

  it("throws on Graph errors (the caller logs them; sign-in isn't affected)", async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 403 })) as unknown as typeof fetch;
    await expect(
      syncProfile(db, identity, "token", { fetchImpl }),
    ).rejects.toThrow("Graph /me answered 403");
  });
});
