import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import type * as ConfigModule from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import { removeFromLeaderboard } from "@/lib/server/services/boards";
import { getLeaderboard } from "@/lib/server/services/leaderboard";
import { createRound } from "@/lib/server/services/rounds";

let db: Db;
let close: () => Promise<void>;
const KEY = "an-external-api-key-of-32-characters";
let configuredKey: string | null = KEY;
const now = new Date("2026-10-20T10:00:00+04:00");

vi.mock("@/lib/server/config", async (original) => ({
  ...(await original<typeof ConfigModule>()),
  getServerConfig: () => ({ ...testConfig, externalApiKey: configuredKey }),
}));
vi.mock("@/lib/server/db/client", () => ({
  getDb: () => db,
  resetDb: () => {},
}));

const { GET } = await import("@/app/api/external/v1/standings/route");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  configuredKey = KEY;
  vi.useFakeTimers({ toFake: ["Date"], now });
});
afterEach(() => vi.useRealTimers());

const call = (query = "", authorization: string | null = `Bearer ${KEY}`) =>
  GET(
    new Request(
      `https://leaderboard.example/api/external/v1/standings${query}`,
      { headers: authorization ? { authorization } : {} },
    ),
  );

/** Ana leads Beka on video; Nino is only on the static board. */
async function setup() {
  const [ana, beka, nino] = await Promise.all(
    [
      ["Ana", "Beridze", "Marketing"],
      ["Beka", "Kapanadze", "IT"],
      ["Nino", "Lomidze", "HR"],
    ].map(([given, family, department]) =>
      makeEmployee(db, {
        email: `${given!.toLowerCase()}@crocobet.com`,
        displayName: `${given} ${family}`,
        givenName: given,
        familyName: family,
        department,
      }),
    ),
  );
  await makePost(db, ana!.id, "tiktok_video", { views: 5000, reactions: 300 });
  await makePost(db, ana!.id, "instagram_reel", { views: 1000, reactions: 50 });
  await makePost(db, beka!.id, "facebook_video", {
    views: 2000,
    reactions: 100,
  });
  await makePost(db, nino!.id, "linkedin_post", { reactions: 70 });
  return { ana: ana!, beka: beka!, nino: nino! };
}

describe("GET /api/external/v1/standings", () => {
  it("answers 401 without the key, with a wrong one, or while no key is set", async () => {
    for (const header of [
      null,
      "Bearer nope",
      `Basic ${KEY}`,
      KEY,
      `Bearer ${KEY}x`,
    ]) {
      const response = await call("", header);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "unauthorized" },
      });
    }
    configuredKey = null;
    expect((await call()).status).toBe(401);
  });

  it("defaults to the 3-Month Challenge video board, with emails", async () => {
    const { ana, beka } = await setup();
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      board: {
        id: "challenge",
        category: "video",
        platform: "all",
        period: "all",
        round: null,
        startsAt: "2026-09-30T20:00:00.000Z",
        endsAt: "2026-12-31T20:00:00.000Z",
        status: "running",
        timeZone: "Asia/Tbilisi",
      },
      totalParticipants: 2,
      lastSyncedAt: null,
      standings: [
        {
          rank: 1,
          previousRank: 1,
          employee: {
            id: ana.id,
            email: "ana@crocobet.com",
            name: "Ana Beridze",
            firstName: "Ana",
            lastName: "Beridze",
            department: "Marketing",
          },
          postCount: 2,
          totalViews: 6000,
          totalReactions: 350,
          score: 6350,
          platforms: ["instagram", "tiktok"],
        },
        {
          rank: 2,
          previousRank: 2,
          employee: {
            id: beka.id,
            email: "beka@crocobet.com",
            name: "Beka Kapanadze",
            firstName: "Beka",
            lastName: "Kapanadze",
            department: "IT",
          },
          postCount: 1,
          totalViews: 2000,
          totalReactions: 100,
          score: 2100,
          platforms: ["facebook"],
        },
      ],
    });
  });

  it("matches the app's leaderboard for the same board", async () => {
    const { nino } = await setup();
    const query = { category: "static", platform: "linkedin" } as const;
    const body = await (
      await call(`?category=${query.category}&platform=${query.platform}`)
    ).json();
    const app = await getLeaderboard(
      db,
      testConfig,
      { ...query, period: "all", round: null, search: "" },
      nino.id,
      now,
    );
    expect(body.board).toMatchObject({
      category: "static",
      platform: "linkedin",
    });
    expect(body.totalParticipants).toBe(app.totalParticipants);
    expect(
      body.standings.map(
        ({ employee, ...rest }: { employee: { id: string } }) => ({
          ...rest,
          id: employee.id,
        }),
      ),
    ).toEqual(
      app.entries.map((entry) => ({
        rank: entry.rank,
        previousRank: entry.previousRank,
        postCount: entry.postCount,
        totalViews: entry.totalViews,
        totalReactions: entry.totalReactions,
        score: entry.score,
        platforms: entry.platforms,
        id: entry.employee.id,
      })),
    );
  });

  it("shows the running round, a finished one by id, and leaves out the people removed from it", async () => {
    const { ana, beka } = await setup();
    const admin = await makeEmployee(db, { role: "admin" });
    const finished = await createRound(db, testConfig, admin, {
      kind: "week",
      name: "Kickoff week",
      startDate: "2026-10-12",
      endDate: "2026-10-18",
    });
    const running = await createRound(db, testConfig, admin, {
      kind: "week",
      name: null,
      startDate: "2026-10-19",
      endDate: "2026-10-25",
    });
    await removeFromLeaderboard(
      db,
      testConfig,
      admin,
      finished.id,
      ana.id,
      now,
    );

    const current = await (await call("?period=week")).json();
    expect(current.board).toMatchObject({
      id: running.id,
      period: "week",
      round: { id: running.id, kind: "week", name: null, number: 2 },
      status: "running",
    });
    // The posts were published on 12 October, before this round.
    expect(current.standings).toEqual([]);

    const past = await (await call(`?period=week&round=${finished.id}`)).json();
    expect(past.board).toMatchObject({
      id: finished.id,
      round: { name: "Kickoff week", number: 1 },
      startsAt: "2026-10-11T20:00:00.000Z",
      endsAt: "2026-10-18T20:00:00.000Z",
      status: "finished",
    });
    expect(
      past.standings.map(
        (entry: { employee: { id: string } }) => entry.employee.id,
      ),
    ).toEqual([beka.id]);
  });

  it("falls back to the challenge when no round of that kind applies", async () => {
    const body = await (await call("?period=month")).json();
    expect(body.board).toMatchObject({
      id: "challenge",
      period: "all",
      round: null,
    });
  });

  it("validates the query", async () => {
    for (const query of [
      "?category=audio",
      "?period=year",
      "?platform=youtube",
      "?round=not-a-uuid",
    ]) {
      const response = await call(query);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "validation_error" },
      });
    }
  });
});
