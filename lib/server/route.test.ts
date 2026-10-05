import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, resetDb, testConfig } from "@/test/factories";
import type { Db } from "@/lib/server/db/client";
import type { EmployeeRow } from "@/lib/server/db/schema";
import type * as ConfigModule from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";

let db: Db;
let close: () => Promise<void>;
let signedIn: EmployeeRow | null = null;

vi.mock("next/server", () => ({ after: (task: () => unknown) => void task() }));
vi.mock("@/lib/server/config", async (original) => ({
  ...(await original<typeof ConfigModule>()),
  getServerConfig: () => testConfig,
}));
vi.mock("@/lib/server/db/client", () => ({ getDb: () => db }));
vi.mock("@/lib/server/auth", () => ({
  requireEmployee: async () => {
    if (!signedIn) throw new HttpError(401, "unauthorized", "Not signed in");
    return { employee: signedIn, isAdmin: signedIn.role === "admin" };
  },
  requireAdmin: (auth: { isAdmin: boolean }) => {
    if (!auth.isAdmin) throw new HttpError(403, "forbidden", "Admins only");
  },
}));

const { GET: getMe } = await import("@/app/api/v1/me/route");
const { POST: postPost } = await import("@/app/api/v1/posts/route");
const { GET: getBoard } = await import("@/app/api/v1/leaderboard/route");

const ORIGIN = "https://leaderboard.example";
const noParams = { params: Promise.resolve({}) };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  signedIn = null;
});

describe("/api/v1 routes", () => {
  it("answer 401 with the error envelope when signed out", async () => {
    const response = await getMe(new Request(`${ORIGIN}/api/v1/me`), noParams);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("return the signed-in employee from /me", async () => {
    signedIn = await makeEmployee(db, {
      email: "boss@crocobet.com",
      givenName: "Mariam",
      familyName: "Chkheidze",
    });
    const response = await getMe(new Request(`${ORIGIN}/api/v1/me`), noParams);
    expect(await response.json()).toMatchObject({
      id: signedIn.id,
      name: "Mariam Chkheidze",
      email: "boss@crocobet.com",
      role: "admin",
    });
  });

  it("refuse cross-origin writes, accept same-origin ones", async () => {
    signedIn = await makeEmployee(db);
    const body = JSON.stringify({
      url: "https://instagram.com/reel/RouteTest1",
    });
    const evil = await postPost(
      new Request(`${ORIGIN}/api/v1/posts`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body,
      }),
      noParams,
    );
    expect(evil.status).toBe(403);
    const ok = await postPost(
      new Request(`${ORIGIN}/api/v1/posts`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body,
      }),
      noParams,
    );
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ status: "pending" });
  });

  it("validate query parameters", async () => {
    signedIn = await makeEmployee(db);
    const bad = await getBoard(
      new Request(`${ORIGIN}/api/v1/leaderboard?category=audio`),
      noParams,
    );
    expect(bad.status).toBe(400);
    const good = await getBoard(
      new Request(`${ORIGIN}/api/v1/leaderboard?category=static&period=all`),
      noParams,
    );
    expect(await good.json()).toMatchObject({
      query: { category: "static", platform: "all", period: "all", search: "" },
      entries: [],
      lastSyncedAt: null,
    });
  });
});
