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
import { resetDb, testConfig } from "@/test/factories";
import type * as ConfigModule from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";

let db: Db;
let close: () => Promise<void>;
const SECRET = "a-sufficiently-long-cron-secret";

vi.mock("@/lib/server/config", async (original) => ({
  ...(await original<typeof ConfigModule>()),
  getServerConfig: () => ({ ...testConfig, cronSecret: SECRET }),
}));
vi.mock("@/lib/server/db/client", () => ({ getDb: () => db }));

const { GET } = await import("@/app/api/cron/refresh-metrics/route");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const call = (authorization?: string) =>
  GET(
    new Request("https://leaderboard.example/api/cron/refresh-metrics", {
      headers: authorization ? { authorization } : {},
    }),
  );

describe("GET /api/cron/refresh-metrics", () => {
  it("answers 401 without the secret or with a wrong one", async () => {
    for (const header of [
      undefined,
      "Bearer nope",
      `Basic ${SECRET}`,
      SECRET,
    ]) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "unauthorized" },
      });
    }
  });

  it("runs the sync with the right secret", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "done",
      run: { trigger: "cron", postsTotal: 0 },
    });
  });
});
