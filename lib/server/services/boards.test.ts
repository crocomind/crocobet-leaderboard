import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import type { Db } from "@/lib/server/db/client";
import type { EmployeeRow } from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import {
  getLeaderboardDetail,
  getProfile,
  listLeaderboards,
  removeFromLeaderboard,
  restoreToLeaderboard,
} from "@/lib/server/services/boards";
import { getLeaderboard } from "@/lib/server/services/leaderboard";
import { exportStandings } from "@/lib/server/services/admin";
import { getEmployeePosts, getMyPosts } from "@/lib/server/services/posts";
import { createRound, deleteRound } from "@/lib/server/services/rounds";

let db: Db;
let close: () => Promise<void>;
// The test challenge runs 1 Oct – 31 Dec 2026 (Tbilisi).
const now = new Date("2026-10-15T12:00:00+04:00");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpError)
      return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error("Expected an HttpError");
}

const auth = (employee: EmployeeRow, isAdmin = false) => ({
  employee,
  isAdmin,
});

/** An admin, Ana and Beka, two weekly rounds (one finished, one running) and an upcoming one. */
async function setup() {
  const admin = await makeEmployee(db, { role: "admin" });
  const ana = await makeEmployee(db, { displayName: "Ana" });
  const beka = await makeEmployee(db, { displayName: "Beka" });
  const week1 = await createRound(db, testConfig, admin, {
    kind: "week",
    name: null,
    startDate: "2026-10-01",
    endDate: "2026-10-07",
  });
  const week2 = await createRound(db, testConfig, admin, {
    kind: "week",
    name: null,
    startDate: "2026-10-08",
    endDate: "2026-10-21",
  });
  const week3 = await createRound(db, testConfig, admin, {
    kind: "week",
    name: null,
    startDate: "2026-10-22",
    endDate: "2026-10-28",
  });
  // Ana leads week 1; Beka leads week 2 (video), Ana posts a static post in week 2.
  await makePost(db, ana.id, "tiktok_video", {
    publishedAt: new Date("2026-10-03T12:00:00+04:00"),
    views: 500,
    reactions: 0,
  });
  await makePost(db, beka.id, "tiktok_video", {
    publishedAt: new Date("2026-10-04T12:00:00+04:00"),
    views: 100,
    reactions: 0,
  });
  await makePost(db, beka.id, "tiktok_video", {
    publishedAt: new Date("2026-10-10T12:00:00+04:00"),
    views: 300,
    reactions: 0,
  });
  await makePost(db, ana.id, "linkedin_post", {
    publishedAt: new Date("2026-10-11T12:00:00+04:00"),
    views: null,
    reactions: 40,
  });
  return { admin, ana, beka, week1, week2, week3 };
}

describe("leaderboards (admin)", () => {
  it("lists the challenge and every round with status and participant counts", async () => {
    const { week1, week2, week3 } = await setup();
    const { leaderboards } = await listLeaderboards(db, testConfig, now);
    expect(leaderboards.map((board) => [board.id, board.status])).toEqual([
      ["challenge", "running"],
      [week1.id, "finished"],
      [week2.id, "running"],
      [week3.id, "upcoming"],
    ]);
    expect(leaderboards[0]).toMatchObject({
      round: null,
      participants: { video: 2, static: 1 },
      removedCount: 0,
    });
    expect(leaderboards[1]?.participants).toEqual({ video: 2, static: 0 });
    expect(leaderboards[2]?.participants).toEqual({ video: 1, static: 1 });
    expect(leaderboards[3]?.participants).toEqual({ video: 0, static: 0 });
  });

  it("removes someone from one leaderboard only, and puts them back", async () => {
    const { admin, ana, beka, week1 } = await setup();
    await removeFromLeaderboard(db, testConfig, admin, week1.id, ana.id, now);
    // Twice is harmless.
    await removeFromLeaderboard(db, testConfig, admin, week1.id, ana.id, now);

    const detail = await getLeaderboardDetail(
      db,
      testConfig,
      week1.id,
      "video",
      now,
    );
    expect(detail.participants.map((p) => [p.rank, p.employee.id])).toEqual([
      [1, beka.id],
    ]);
    expect(detail.participants[0]?.employee.email).toBe(beka.email);
    expect(detail.removed).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: ana.id, email: ana.email }),
        removedBy: { id: admin.id, name: expect.any(String) },
      }),
    ]);
    expect(detail.leaderboard.removedCount).toBe(1);

    // Week 1's public board skips her; the challenge still counts her post.
    const week = await getLeaderboard(
      db,
      testConfig,
      {
        category: "video",
        platform: "all",
        period: "week",
        round: week1.id,
        search: "",
      },
      beka.id,
      now,
    );
    expect(week.entries.map((entry) => entry.employee.id)).toEqual([beka.id]);
    const challenge = await getLeaderboard(
      db,
      testConfig,
      {
        category: "video",
        platform: "all",
        period: "all",
        round: null,
        search: "",
      },
      ana.id,
      now,
    );
    expect(challenge.entries[0]?.employee.id).toBe(ana.id);

    await restoreToLeaderboard(db, testConfig, week1.id, ana.id, now);
    await restoreToLeaderboard(db, testConfig, week1.id, ana.id, now);
    const back = await getLeaderboardDetail(
      db,
      testConfig,
      week1.id,
      "video",
      now,
    );
    expect(back.participants[0]?.employee.id).toBe(ana.id);
    expect(back.removed).toEqual([]);
  });

  it("takes someone off the challenge, which their summary reflects", async () => {
    const { admin, ana } = await setup();
    await removeFromLeaderboard(
      db,
      testConfig,
      admin,
      "challenge",
      ana.id,
      now,
    );
    const mine = await getMyPosts({ db, config: testConfig, now }, ana);
    expect(mine.summary.boards.video).toMatchObject({
      rank: null,
      totalParticipants: 1,
    });
  });

  it("refuses unknown leaderboards and employees, and forgets a deleted round's removals", async () => {
    const { admin, ana, week1 } = await setup();
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(
      await failure(() =>
        getLeaderboardDetail(db, testConfig, missing, "video", now),
      ),
    ).toEqual({ status: 404, code: "not_found" });
    expect(
      await failure(() =>
        removeFromLeaderboard(db, testConfig, admin, week1.id, missing, now),
      ),
    ).toEqual({ status: 404, code: "not_found" });

    await removeFromLeaderboard(db, testConfig, admin, week1.id, ana.id, now);
    await deleteRound(db, week1.id);
    const { leaderboards } = await listLeaderboards(db, testConfig, now);
    expect(leaderboards.every((board) => board.removedCount === 0)).toBe(true);
  });
});

describe("profiles", () => {
  it("shows the challenge and every started round with ranks per category", async () => {
    const { ana, week1, week2 } = await setup();
    const profile = await getProfile(db, testConfig, auth(ana), ana.id, now);
    expect(profile.employee).toMatchObject({ id: ana.id, email: ana.email });
    expect(profile.challenge.results.video).toMatchObject({
      rank: 1,
      totalParticipants: 2,
      score: 500,
    });
    // Newest first; the upcoming round isn't there.
    expect(profile.rounds.map((board) => board.id)).toEqual([
      week2.id,
      week1.id,
    ]);
    expect(profile.rounds[0]).toMatchObject({
      status: "running",
      removed: false,
      results: {
        video: { rank: null, totalParticipants: 1, score: 0 },
        static: { rank: 1, totalParticipants: 1, score: 40, totalViews: null },
      },
    });
    expect(profile.rounds[1]).toMatchObject({
      status: "finished",
      results: { video: { rank: 1, totalParticipants: 2, score: 500 } },
    });
  });

  it("marks leaderboards an admin took them off", async () => {
    const { admin, ana, week1 } = await setup();
    await removeFromLeaderboard(db, testConfig, admin, week1.id, ana.id, now);
    const profile = await getProfile(db, testConfig, auth(ana), ana.id, now);
    expect(profile.rounds.find((board) => board.id === week1.id)).toMatchObject(
      { removed: true, results: { video: { rank: null } } },
    );
  });

  it("is visible to the person and to admins only", async () => {
    const { admin, ana, beka } = await setup();
    expect(
      await failure(() => getProfile(db, testConfig, auth(beka), ana.id, now)),
    ).toEqual({ status: 403, code: "forbidden" });
    const seen = await getProfile(
      db,
      testConfig,
      auth(admin, true),
      ana.id,
      now,
    );
    expect(seen.employee.id).toBe(ana.id);
    expect(
      await failure(() =>
        getProfile(
          db,
          testConfig,
          auth(admin, true),
          "00000000-0000-4000-8000-000000000000",
          now,
        ),
      ),
    ).toEqual({ status: 404, code: "not_found" });
  });
});

describe("frozen results", () => {
  it("freezes a finished round at its end, but not a running board", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db, { displayName: "Ana" });
    const beka = await makeEmployee(db, { displayName: "Beka" });
    // 1–7 October; it ended at 8 Oct 00:00 Tbilisi (7 Oct 20:00 UTC).
    const week = await createRound(db, testConfig, admin, {
      kind: "week",
      name: null,
      startDate: "2026-10-01",
      endDate: "2026-10-07",
    });
    // Ana went viral after the week; Beka's post was approved after it ended.
    const anaPost = await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-10-03T12:00:00+04:00"),
      approvedAt: new Date("2026-10-04T12:00:00+04:00"),
      views: 5000,
      reactions: 0,
      snapshots: [
        { at: new Date("2026-10-05T12:00:00+04:00"), views: 100, reactions: 0 },
        {
          at: new Date("2026-10-12T12:00:00+04:00"),
          views: 5000,
          reactions: 0,
        },
      ],
    });
    await makePost(db, beka.id, "tiktok_video", {
      publishedAt: new Date("2026-10-06T12:00:00+04:00"),
      approvedAt: new Date("2026-10-09T12:00:00+04:00"),
      views: 400,
      reactions: 0,
      snapshots: [
        { at: new Date("2026-10-06T13:00:00+04:00"), views: 300, reactions: 0 },
        { at: new Date("2026-10-10T12:00:00+04:00"), views: 400, reactions: 0 },
      ],
    });

    const board = await getLeaderboard(
      db,
      testConfig,
      {
        category: "video",
        platform: "all",
        period: "week",
        round: week.id,
        search: "",
      },
      ana.id,
      now,
    );
    expect(
      board.entries.map((entry) => [
        entry.employee.id,
        entry.score,
        entry.rank,
        entry.previousRank,
      ]),
    ).toEqual([
      [beka.id, 300, 1, 1],
      [ana.id, 100, 2, 2],
    ]);

    const sheet = await getEmployeePosts(
      { db, config: testConfig, now },
      ana.id,
      { category: "video", platform: "all", period: "week", round: week.id },
    );
    expect(sheet).toEqual([
      expect.objectContaining({ id: anaPost.id, views: 100, score: 100 }),
    ]);

    const detail = await getLeaderboardDetail(
      db,
      testConfig,
      week.id,
      "video",
      now,
    );
    expect(detail.participants.map((p) => [p.employee.id, p.score])).toEqual([
      [beka.id, 300],
      [ana.id, 100],
    ]);

    const profile = await getProfile(db, testConfig, auth(ana), ana.id, now);
    expect(profile.rounds[0]?.results.video).toMatchObject({
      rank: 2,
      score: 100,
    });
    // The challenge isn't a round: it keeps the latest numbers.
    expect(profile.challenge.results.video).toMatchObject({
      rank: 1,
      score: 5000,
    });

    const { csv } = await exportStandings(
      db,
      testConfig,
      { category: "video", period: "week", round: week.id },
      now,
    );
    const lines = csv
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(lines[1]).toMatch(/^1,Beka,.*,300,/);
  });
});
