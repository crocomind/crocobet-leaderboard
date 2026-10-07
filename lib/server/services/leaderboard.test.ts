import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import { resolvePeriod } from "@/lib/periods";
import { postsAsOf, rankBoard, rankMap } from "@/lib/ranking";
import type { Db } from "@/lib/server/db/client";
import { postMetricSnapshots, posts, syncRuns } from "@/lib/server/db/schema";
import { loadEmployees } from "@/lib/server/services/employees";
import {
  getLeaderboard,
  lastSyncedAt,
} from "@/lib/server/services/leaderboard";
import { toRankable } from "@/lib/server/services/mappers";
import { createRound } from "@/lib/server/services/rounds";

let db: Db;
let close: () => Promise<void>;
const now = new Date("2026-10-20T10:00:00+04:00");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const board = (overrides = {}) => ({
  category: "video" as const,
  platform: "all" as const,
  period: "all" as const,
  round: null,
  search: "",
  ...overrides,
});

describe("getLeaderboard", () => {
  it("equals rankBoard() over the same data, including yesterday's ranks", async () => {
    const people = await Promise.all(
      ["Ana", "Beka", "Nino", "Zura", "Levan"].map((name) =>
        makeEmployee(db, {
          displayName: name,
          givenName: name,
          familyName: "Test",
        }),
      ),
    );
    const [ana, beka, nino, zura, levan] = people;
    await makePost(db, ana!.id, "tiktok_video", {
      views: 5000,
      reactions: 300,
      snapshots: [
        { at: hoursAgo(40), views: 1000, reactions: 100 },
        { at: hoursAgo(28), views: 1500, reactions: 120 },
        { at: hoursAgo(4), views: 5000, reactions: 300 },
      ],
    });
    await makePost(db, beka!.id, "instagram_reel", {
      views: 3000,
      reactions: 200,
      snapshots: [{ at: hoursAgo(30), views: 2900, reactions: 190 }],
    });
    await makePost(db, nino!.id, "facebook_video", {
      views: 2500,
      reactions: 50,
      approvedAt: hoursAgo(2), // new since yesterday
      snapshots: [{ at: hoursAgo(30), views: 2000, reactions: 40 }],
    });
    // Never counted: wrong category, not approved, outside the window.
    await makePost(db, zura!.id, "linkedin_post", { reactions: 900 });
    await makePost(db, zura!.id, "tiktok_video", {
      status: "pending",
      views: 99_999,
    });
    await makePost(db, levan!.id, "tiktok_video", {
      status: "rejected",
      views: 99_999,
    });
    await makePost(db, levan!.id, "tiktok_video", {
      status: "disqualified",
      views: 99_999,
    });
    await makePost(db, levan!.id, "tiktok_video", {
      publishedAt: new Date("2026-09-30T23:00:00+04:00"),
      views: 99_999,
    });

    const response = await getLeaderboard(
      db,
      testConfig,
      board(),
      ana!.id,
      now,
    );

    // The same computation in JS, from the rows themselves.
    const rows = await db.select().from(posts);
    const snapshots = await db.select().from(postMetricSnapshots);
    const employees = await loadEmployees(
      db,
      people.map((person) => person.id),
    );
    const range = resolvePeriod("all", now, testConfig.campaign);
    const filter = {
      category: "video" as const,
      platform: "all" as const,
      range: { start: range.start, end: range.end },
    };
    const withHistory = rows.map((row) => ({
      ...toRankable(row),
      approvedAt: row.approvedAt,
      snapshots: snapshots
        .filter((snapshot) => snapshot.postId === row.id)
        .map((snapshot) => ({
          fetchedAt: snapshot.fetchedAt,
          views: snapshot.views,
          reactions: snapshot.reactions,
        })),
    }));
    const yesterday = rankBoard(
      postsAsOf(withHistory, new Date(now.getTime() - 86_400_000)),
      employees,
      filter,
    );
    const expected = rankBoard(rows.map(toRankable), employees, filter, {
      meId: ana!.id,
      previousRanks: rankMap(yesterday),
    });

    expect(response.entries).toEqual(expected.entries);
    expect(response.myStanding).toEqual(expected.myStanding);
    expect(response.entries.map((entry) => entry.employee.name)).toEqual([
      "Ana Test",
      "Beka Test",
      "Nino Test",
    ]);
    // Yesterday Beka (2900 + 190) led Ana (1500 + 120); Nino wasn't approved yet.
    expect(response.entries.map((entry) => entry.previousRank)).toEqual([
      2,
      1,
      null,
    ]);
    expect(response.period).toEqual({
      start: "2026-09-30T20:00:00.000Z",
      end: "2026-12-31T20:00:00.000Z",
      isCurrent: true,
      timeZone: "Asia/Tbilisi",
      round: null,
    });
  });

  it("keeps views off the static board and never shows emails", async () => {
    const ana = await makeEmployee(db, { email: "ana@crocobet.com" });
    await makePost(db, ana.id, "linkedin_post", { views: 777, reactions: 40 });
    await makePost(db, ana.id, "facebook_post", { views: null, reactions: 10 });
    const response = await getLeaderboard(
      db,
      testConfig,
      board({ category: "static" }),
      ana.id,
      now,
    );
    expect(response.entries[0]).toMatchObject({
      totalViews: null,
      totalReactions: 50,
      score: 50,
      platforms: ["facebook", "linkedin"],
      topPost: { views: null, score: 40, platform: "linkedin" },
    });
    expect(JSON.stringify(response)).not.toContain("ana@crocobet.com");
  });

  it("drops a post from every board when it's disqualified, and counts it again when reinstated", async () => {
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      views: 100,
      reactions: 5,
    });
    const count = async () =>
      (await getLeaderboard(db, testConfig, board(), ana.id, now))
        .totalParticipants;
    expect(await count()).toBe(1);
    await db
      .update(posts)
      .set({ status: "disqualified" })
      .where(eq(posts.id, post.id));
    expect(await count()).toBe(0);
    await db
      .update(posts)
      .set({ status: "approved" })
      .where(eq(posts.id, post.id));
    expect(await count()).toBe(1);
  });

  it("puts a post in the Tbilisi week of its publish time", async () => {
    const ana = await makeEmployee(db);
    // Sunday 23:59:59 vs Monday 00:00 in Tbilisi (UTC+4).
    await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-10-18T23:59:59+04:00"),
      views: 10,
      reactions: 0,
    });
    await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-10-19T00:00:00+04:00"),
      views: 20,
      reactions: 0,
    });
    const admin = await makeEmployee(db, { role: "admin" });
    for (const [kind, startDate, endDate] of [
      ["week", "2026-10-19", "2026-10-25"],
      ["month", "2026-10-01", "2026-10-31"],
    ] as const)
      await createRound(db, testConfig, admin, {
        kind,
        name: null,
        startDate,
        endDate,
      });
    const week = await getLeaderboard(
      db,
      testConfig,
      board({ period: "week" }),
      ana.id,
      now,
    );
    expect(week.period.start).toBe("2026-10-18T20:00:00.000Z");
    expect(week.entries[0]?.score).toBe(20);
    const month = await getLeaderboard(
      db,
      testConfig,
      board({ period: "month" }),
      ana.id,
      now,
    );
    expect(month.entries[0]?.score).toBe(30);
  });

  it("searches without renumbering and ignores a platform that isn't on the board", async () => {
    const people = await Promise.all(
      ["Ana", "Beka"].map((name) => makeEmployee(db, { displayName: name })),
    );
    await makePost(db, people[0]!.id, "tiktok_video", {
      views: 100,
      reactions: 0,
    });
    await makePost(db, people[1]!.id, "tiktok_video", {
      views: 50,
      reactions: 0,
    });
    const searched = await getLeaderboard(
      db,
      testConfig,
      board({ search: "bek", platform: "linkedin" }),
      people[0]!.id,
      now,
    );
    expect(searched.query.platform).toBe("all");
    expect(searched.entries.map((entry) => entry.rank)).toEqual([2]);
    expect(searched.totalParticipants).toBe(2);
    expect(searched.myStanding?.entry.rank).toBe(1);
  });

  it("reports when metrics were last synced", async () => {
    expect(await lastSyncedAt(db)).toBeNull();
    await db.insert(syncRuns).values([
      { trigger: "cron", startedAt: hoursAgo(14), finishedAt: hoursAgo(13.9) },
      { trigger: "cron", startedAt: hoursAgo(2), finishedAt: hoursAgo(1.9) },
      {
        trigger: "manual",
        startedAt: hoursAgo(1),
        finishedAt: hoursAgo(0.9),
        error: "provider down",
      },
      { trigger: "manual", startedAt: hoursAgo(0.5) },
    ]);
    expect(await lastSyncedAt(db)).toEqual(hoursAgo(1.9));
  });
});
