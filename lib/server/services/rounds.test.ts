import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import type { Db } from "@/lib/server/db/client";
import { HttpError } from "@/lib/server/http";
import { getLeaderboard } from "@/lib/server/services/leaderboard";
import { exportStandings } from "@/lib/server/services/admin";
import {
  createRound,
  deleteRound,
  generateRoundsFor,
  getRounds,
  updateChallenge,
  updateRound,
  withCampaign,
} from "@/lib/server/services/rounds";

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

const board = (overrides: Record<string, unknown> = {}) => ({
  category: "video" as const,
  platform: "all" as const,
  period: "week" as const,
  round: null,
  search: "",
  ...overrides,
});

describe("rounds", () => {
  it("creates, numbers, edits and deletes rounds, and refuses overlaps", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const second = await createRound(db, testConfig, admin, {
      kind: "week",
      name: null,
      startDate: "2026-10-12",
      endDate: "2026-10-18",
    });
    const first = await createRound(db, testConfig, admin, {
      kind: "week",
      name: "Kickoff week",
      startDate: "2026-10-05",
      endDate: "2026-10-11",
    });
    expect(first).toMatchObject({
      kind: "week",
      name: "Kickoff week",
      number: 1,
      startDate: "2026-10-05",
      endDate: "2026-10-11",
      startsAt: "2026-10-04T20:00:00.000Z",
      endsAt: "2026-10-11T20:00:00.000Z",
    });
    expect(
      (await getRounds(db, testConfig)).rounds.map((round) => [
        round.id,
        round.number,
      ]),
    ).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);

    expect(
      await failure(() =>
        createRound(db, testConfig, admin, {
          kind: "week",
          name: null,
          startDate: "2026-10-18",
          endDate: "2026-10-24",
        }),
      ),
    ).toEqual({ status: 422, code: "round_overlap" });
    expect(
      await failure(() =>
        createRound(db, testConfig, admin, {
          kind: "month",
          name: null,
          startDate: "2026-09-20",
          endDate: "2026-10-20",
        }),
      ),
    ).toEqual({ status: 422, code: "outside_challenge" });
    expect(
      await failure(() =>
        updateRound(db, testConfig, second.id, { endDate: "2026-10-10" }),
      ),
    ).toEqual({ status: 422, code: "invalid_dates" });

    const renamed = await updateRound(db, testConfig, second.id, {
      name: "Second week",
      endDate: "2026-10-19",
    });
    expect(renamed).toMatchObject({
      name: "Second week",
      endDate: "2026-10-19",
    });
    await deleteRound(db, first.id);
    expect((await getRounds(db, testConfig)).rounds).toHaveLength(1);
    expect(await failure(() => deleteRound(db, first.id))).toEqual({
      status: 404,
      code: "not_found",
    });
  });

  it("generates rounds for the whole challenge, once", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const months = await generateRoundsFor(db, testConfig, admin, "month");
    expect(
      months.rounds.map((round) => [round.startDate, round.endDate]),
    ).toEqual([
      ["2026-10-01", "2026-10-31"],
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", "2026-12-31"],
    ]);
    expect(
      await failure(() => generateRoundsFor(db, testConfig, admin, "month")),
    ).toEqual({
      status: 409,
      code: "rounds_exist",
    });
    const weeks = await generateRoundsFor(db, testConfig, admin, "week");
    expect(weeks.rounds.filter((round) => round.kind === "week")).toHaveLength(
      14,
    );
  });

  it("shows the running round, a chosen past round, or the challenge without one", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-10-09T12:00:00+04:00"),
      views: 100,
      reactions: 0,
    });
    await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-10-14T12:00:00+04:00"),
      views: 20,
      reactions: 0,
    });

    // Without weekly rounds there's no weekly leaderboard: the challenge shows.
    const none = await getLeaderboard(db, testConfig, board(), ana.id, now);
    expect(none.query.period).toBe("all");
    expect(none.period).toMatchObject({
      round: null,
      start: "2026-09-30T20:00:00.000Z",
      end: "2026-12-31T20:00:00.000Z",
    });
    expect(none.entries[0]?.score).toBe(120);

    // A Thursday-to-Wednesday round covering today, and the one before it.
    const earlier = await createRound(db, testConfig, admin, {
      kind: "week",
      name: null,
      startDate: "2026-10-01",
      endDate: "2026-10-07",
    });
    const current = await createRound(db, testConfig, admin, {
      kind: "week",
      name: "Week of the hackathon",
      startDate: "2026-10-08",
      endDate: "2026-10-21",
    });
    const shown = await getLeaderboard(db, testConfig, board(), ana.id, now);
    expect(shown.period).toMatchObject({
      start: "2026-10-07T20:00:00.000Z",
      end: "2026-10-21T20:00:00.000Z",
      isCurrent: true,
      round: {
        id: current.id,
        number: 2,
        name: "Week of the hackathon",
        kind: "week",
      },
    });
    expect(shown.query).toMatchObject({ period: "week", round: null });
    expect(shown.entries[0]?.score).toBe(120);

    // A round that hasn't started can't be picked: the running one shows.
    const upcoming = await createRound(db, testConfig, admin, {
      kind: "week",
      name: null,
      startDate: "2026-10-22",
      endDate: "2026-10-28",
    });
    const early = await getLeaderboard(
      db,
      testConfig,
      board({ round: upcoming.id }),
      ana.id,
      now,
    );
    expect(early.period.round?.id).toBe(current.id);
    expect(early.query.round).toBeNull();

    const past = await getLeaderboard(
      db,
      testConfig,
      board({ round: earlier.id }),
      ana.id,
      now,
    );
    expect(past.period).toMatchObject({
      isCurrent: false,
      round: { id: earlier.id, number: 1 },
    });
    expect(past.query.round).toBe(earlier.id);
    expect(past.entries).toEqual([]);

    // Exports follow the same rounds.
    const { csv } = await exportStandings(
      db,
      testConfig,
      { category: "video", period: "week", round: current.id },
      now,
    );
    expect(csv.replace(/^﻿/, "").trim().split("\r\n")).toHaveLength(2);
  });
});

describe("challenge dates", () => {
  it("lets admins set the dates, which then apply everywhere", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    expect((await getRounds(db, testConfig)).challenge).toMatchObject({
      source: "default",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      timeZone: "Asia/Tbilisi",
    });
    expect(
      await failure(() =>
        updateChallenge(db, testConfig, admin, {
          startDate: "2026-11-01",
          endDate: "2026-10-01",
        }),
      ),
    ).toEqual({ status: 422, code: "invalid_dates" });
    const saved = await updateChallenge(db, testConfig, admin, {
      startDate: "2026-10-06",
      endDate: "2027-01-05",
    });
    expect(saved).toEqual({
      startsAt: "2026-10-05T20:00:00.000Z",
      endsAt: "2027-01-05T20:00:00.000Z",
      startDate: "2026-10-06",
      endDate: "2027-01-05",
      timeZone: "Asia/Tbilisi",
      source: "admin",
    });
    const effective = await withCampaign(db, testConfig);
    expect(effective.campaign.startsAt).toEqual(
      new Date("2026-10-06T00:00:00+04:00"),
    );
    expect((await getRounds(db, testConfig)).challenge.source).toBe("admin");
  });
});
