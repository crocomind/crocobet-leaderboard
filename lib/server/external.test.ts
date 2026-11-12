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
import { createRound } from "@/lib/server/services/rounds";

let db: Db;
let close: () => Promise<void>;
const KEY = "an-external-api-key-of-32-characters";
let configuredKey: string | null = KEY;
/** Tuesday of the second week; the challenge runs October–December 2026. */
const now = new Date("2026-10-20T10:00:00+04:00");

vi.mock("@/lib/server/config", async (original) => ({
  ...(await original<typeof ConfigModule>()),
  getServerConfig: () => ({ ...testConfig, externalApiKey: configuredKey }),
}));
vi.mock("@/lib/server/db/client", () => ({
  getDb: () => db,
  resetDb: () => {},
}));

const { GET } = await import("@/app/api/external/v1/leaderboards/route");
const { GET: getContent } =
  await import("@/app/api/external/v1/content/[username]/route");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  configuredKey = KEY;
  vi.useFakeTimers({ toFake: ["Date"], now });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const call = (authorization: string | null = `Bearer ${KEY}`) =>
  GET(
    new Request("https://leaderboard.example/api/external/v1/leaderboards", {
      headers: authorization ? { authorization } : {},
    }),
    { params: Promise.resolve({}) },
  );

const content = (
  username: string,
  authorization: string | null = `Bearer ${KEY}`,
) =>
  getContent(
    new Request(
      `https://leaderboard.example/api/external/v1/content/${username}`,
      { headers: authorization ? { authorization } : {} },
    ),
    { params: Promise.resolve({ username }) },
  );

describe("GET /api/external/v1/leaderboards", () => {
  it("answers 401 without the key, with a wrong one, or while no key is set", async () => {
    for (const header of [
      null,
      "Bearer nope",
      `Basic ${KEY}`,
      KEY,
      `Bearer ${KEY}x`,
    ]) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "unauthorized" },
      });
    }
    configuredKey = null;
    expect((await call()).status).toBe(401);
  });

  it("lists every started leaderboard with its ranked participants, and nothing else", async () => {
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
    // Published on 12 October (week 1). The TikTok had fewer views when
    // week 1 ended; the Reel was never fetched, so it keeps its own numbers.
    await makePost(db, ana!.id, "tiktok_video", {
      views: 5000,
      reactions: 300,
      snapshots: [
        {
          at: new Date("2026-10-18T12:00:00+04:00"),
          views: 4000,
          reactions: 200,
        },
      ],
    });
    await makePost(db, ana!.id, "instagram_reel", {
      views: 1000,
      reactions: 50,
    });
    await makePost(db, nino!.id, "linkedin_post", { reactions: 70 });
    // Published this morning (week 2).
    await makePost(db, beka!.id, "facebook_video", {
      views: 2000,
      reactions: 100,
      publishedAt: new Date("2026-10-20T08:00:00+04:00"),
      approvedAt: new Date("2026-10-20T09:00:00+04:00"),
    });
    // Never counted.
    await makePost(db, beka!.id, "tiktok_video", {
      status: "pending",
      views: 99_999,
    });

    const admin = await makeEmployee(db, { role: "admin" });
    const round = (
      kind: "week" | "month",
      startDate: string,
      endDate: string,
      name: string | null = null,
    ) => createRound(db, testConfig, admin, { kind, name, startDate, endDate });
    const week1 = await round("week", "2026-10-12", "2026-10-18", "Kickoff");
    await round("week", "2026-10-19", "2026-10-25");
    await round("week", "2026-10-26", "2026-11-01"); // upcoming
    await round("month", "2026-10-01", "2026-10-31");
    await removeFromLeaderboard(db, testConfig, admin, week1.id, nino!.id, now);

    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const person = (
      who: typeof ana,
      department: string,
      result: {
        rank: number;
        score: number;
        views: number | null;
        reactions: number;
        posts: number;
      },
    ) => ({
      rank: result.rank,
      name: who!.displayName,
      email: who!.email,
      department,
      score: result.score,
      views: result.views,
      reactions: result.reactions,
      posts: result.posts,
    });
    const anaNow = person(ana, "Marketing", {
      rank: 1,
      score: 6350,
      views: 6000,
      reactions: 350,
      posts: 2,
    });
    const bekaNow = (rank: number) =>
      person(beka, "IT", {
        rank,
        score: 2100,
        views: 2000,
        reactions: 100,
        posts: 1,
      });
    const ninoNow = person(nino, "HR", {
      rank: 1,
      score: 70,
      views: null,
      reactions: 70,
      posts: 1,
    });

    expect(await response.json()).toEqual({
      leaderboards: [
        {
          type: "challenge",
          name: "3-Month Challenge",
          startDate: "2026-10-01",
          endDate: "2026-12-31",
          status: "running",
          video: [anaNow, bekaNow(2)],
          static: [ninoNow],
        },
        {
          type: "week",
          name: "Kickoff",
          startDate: "2026-10-12",
          endDate: "2026-10-18",
          status: "finished",
          // Frozen at the week's end: 4000 + 200 and 1000 + 50.
          video: [
            person(ana, "Marketing", {
              rank: 1,
              score: 5250,
              views: 5000,
              reactions: 250,
              posts: 2,
            }),
          ],
          // Nino was taken off this week only.
          static: [],
        },
        {
          type: "week",
          name: "Week 2",
          startDate: "2026-10-19",
          endDate: "2026-10-25",
          status: "running",
          video: [bekaNow(1)],
          static: [],
        },
        {
          type: "month",
          name: "October",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          status: "running",
          video: [anaNow, bekaNow(2)],
          static: [ninoNow],
        },
      ],
    });
  });

  it("lists only the challenge while no rounds are set up", async () => {
    const body = await (await call()).json();
    expect(body).toEqual({
      leaderboards: [
        {
          type: "challenge",
          name: "3-Month Challenge",
          startDate: "2026-10-01",
          endDate: "2026-12-31",
          status: "running",
          video: [],
          static: [],
        },
      ],
    });
  });
});

describe("GET /api/external/v1/content/{username}", () => {
  it("answers 401 without the right key", async () => {
    await makeEmployee(db, { email: "jdoe@crocobet.com" });
    for (const header of [null, "Bearer nope"]) {
      const response = await content("jdoe", header);
      expect(response.status).toBe(401);
    }
  });

  it("returns the employee and their approved posts, newest first", async () => {
    vi.stubEnv("AUTH_ALLOWED_EMAIL_DOMAINS", "crocobet.com");
    const john = await makeEmployee(db, {
      email: "jdoe@crocobet.com",
      displayName: "John Doe",
      givenName: "John",
      familyName: "Doe",
      department: "Marketing",
    });
    const other = await makeEmployee(db, { email: "jdoe2@crocobet.com" });
    const reel = await makePost(db, john.id, "instagram_reel", {
      title: "Behind the scenes",
      views: 5000,
      reactions: 300,
      thumbnailUrl: "https://cdn.example/reel.jpg",
      publishedAt: new Date("2026-10-15T12:00:00+04:00"),
    });
    const linkedin = await makePost(db, john.id, "linkedin_post", {
      reactions: 70,
      publishedAt: new Date("2026-10-18T12:00:00+04:00"),
    });
    for (const status of ["pending", "rejected", "disqualified"] as const)
      await makePost(db, john.id, "tiktok_video", { status, views: 99_999 });
    await makePost(db, other.id, "tiktok_video", { views: 1 });

    const response = await content("JDoe");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      employee: {
        name: "John Doe",
        email: "jdoe@crocobet.com",
        department: "Marketing",
      },
      posts: [
        {
          url: linkedin.urlCanonical,
          platform: "linkedin",
          category: "static",
          title: null,
          publishedAt: "2026-10-18T08:00:00.000Z",
          views: null,
          reactions: 70,
          score: 70,
          thumbnailUrl: null,
        },
        {
          url: reel.urlCanonical,
          platform: "instagram",
          category: "video",
          title: "Behind the scenes",
          publishedAt: "2026-10-15T08:00:00.000Z",
          views: 5000,
          reactions: 300,
          score: 5300,
          thumbnailUrl: "https://cdn.example/reel.jpg",
        },
      ],
    });
  });

  it("returns an empty list for someone with no approved posts", async () => {
    await makeEmployee(db, { email: "jdoe@crocobet.com", department: "" });
    expect(await (await content("jdoe")).json()).toMatchObject({
      employee: { email: "jdoe@crocobet.com", department: "" },
      posts: [],
    });
  });

  it("prefers the first allowed domain when two people share a username", async () => {
    vi.stubEnv("AUTH_ALLOWED_EMAIL_DOMAINS", "crocobet.com,croco.ge");
    await makeEmployee(db, { email: "jdoe@croco.ge" });
    expect(await (await content("jdoe")).json()).toMatchObject({
      employee: { email: "jdoe@croco.ge" },
    });
    await makeEmployee(db, { email: "jdoe@crocobet.com" });
    expect(await (await content("jdoe")).json()).toMatchObject({
      employee: { email: "jdoe@crocobet.com" },
    });
  });

  it("answers 404 for an unknown username, one at another domain, or a malformed one", async () => {
    vi.stubEnv("AUTH_ALLOWED_EMAIL_DOMAINS", "crocobet.com");
    await makeEmployee(db, { email: "jdoe@crocobet.com" });
    await makeEmployee(db, { email: "asmith@gmail.com" });
    for (const username of [
      "nobody",
      "asmith",
      "jdoe@crocobet.com",
      "%25",
      "j doe",
    ]) {
      const response = await content(username);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "not_found" },
      });
    }
  });
});
