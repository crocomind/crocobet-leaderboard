import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../errors";
import type { AdminPostsQuery, LeaderboardQuery } from "../types";
import { MockBackend } from "./backend";
import { createInitialState, MOCK_CURRENT_USER_ID } from "./data";
import { CHECK_DELAY_MS, DAY_MS } from "./engine";
import type { MockState } from "./types";

const start = new Date("2026-10-05T10:30:00Z");
const later = (ms: number) => new Date(start.getTime() + ms);

let state: MockState;
let admin: MockBackend;
let employee: MockBackend;

beforeEach(() => {
  state = createInitialState(start);
  admin = new MockBackend(state, { id: MOCK_CURRENT_USER_ID, role: "admin" });
  employee = new MockBackend(state, {
    id: MOCK_CURRENT_USER_ID,
    role: "employee",
  });
});

function errorOf(run: () => unknown): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected an ApiError");
}

const board = (
  overrides: Partial<LeaderboardQuery> = {},
): LeaderboardQuery => ({
  category: "video",
  platform: "all",
  period: "all",
  round: null,
  search: "",
  ...overrides,
});

const queue = (overrides: Partial<AdminPostsQuery> = {}): AdminPostsQuery => ({
  status: "pending",
  check: "all",
  flag: "all",
  category: "all",
  platform: "all",
  q: "",
  ...overrides,
});

const findPost = (predicate: (post: MockState["posts"][number]) => boolean) => {
  const post = state.posts.find(predicate);
  if (!post) throw new Error("No matching mock post");
  return post;
};

describe("leaderboard", () => {
  it("never shows views on the static board", () => {
    const response = admin.getLeaderboard(board({ category: "static" }), start);
    expect(response.entries.length).toBeGreaterThan(0);
    for (const entry of response.entries) {
      expect(entry.totalViews).toBeNull();
      expect(entry.topPost.views).toBeNull();
      expect(entry.score).toBe(entry.totalReactions);
    }
  });

  it("counts only approved posts of the board's category", () => {
    const response = admin.getLeaderboard(board(), start);
    const counted = response.entries.reduce(
      (sum, entry) => sum + entry.postCount,
      0,
    );
    const campaign = state.campaign;
    const expected = state.posts.filter(
      (post) =>
        post.status === "approved" &&
        ["tiktok_video", "instagram_reel", "facebook_video"].includes(
          post.contentType,
        ) &&
        post.publishedAt !== null &&
        post.publishedAt >= campaign.startsAt &&
        post.publishedAt < campaign.endsAt,
    ).length;
    expect(counted).toBe(expected);
  });

  it("keeps ranks when searching and reports the period", () => {
    const full = admin.getLeaderboard(board(), start);
    const target = full.entries[4]!;
    const searched = admin.getLeaderboard(
      board({ search: target.employee.name.slice(0, 5).toLowerCase() }),
      start,
    );
    expect(searched.entries.map((entry) => entry.rank)).toContain(target.rank);
    expect(searched.totalParticipants).toBe(full.totalParticipants);
    expect(searched.period).toMatchObject({
      start: state.campaign.startsAt,
      end: state.campaign.endsAt,
      isCurrent: true,
      timeZone: "Asia/Tbilisi",
    });
    expect(full.lastSyncedAt).not.toBeNull();
  });

  it("drops a platform that isn't on the board", () => {
    const response = admin.getLeaderboard(
      board({ category: "video", platform: "linkedin" }),
      start,
    );
    expect(response.query.platform).toBe("all");
  });
});

describe("submissions", () => {
  const url = "https://www.instagram.com/reel/NewReel123/?igsh=abc";

  it("accepts a valid link as pending with a queued check that settles", () => {
    const post = employee.submitPost({ url, title: "Team lunch" }, start);
    expect(post).toMatchObject({
      url: "https://instagram.com/reel/NewReel123",
      status: "pending",
      category: "video",
      title: "Team lunch",
      check: { status: "queued" },
    });
    expect(employee.settle(later(CHECK_DELAY_MS + 1))).toBe(true);
    const settled = employee
      .getMyPosts(later(CHECK_DELAY_MS + 1))
      .posts.find((candidate) => candidate.id === post.id);
    expect(settled?.check.status).not.toBe("queued");
  });

  it("rejects duplicates across link variants", () => {
    employee.submitPost({ url }, start);
    const error = errorOf(() =>
      employee.submitPost(
        { url: "https://instagram.com/reels/NewReel123" },
        start,
      ),
    );
    expect(error).toMatchObject({ status: 409, code: "duplicate_post" });
  });

  it("maps unsupported links to the contract's error codes", () => {
    expect(
      errorOf(() =>
        employee.submitPost(
          { url: "https://www.instagram.com/stories/someone/123" },
          start,
        ),
      ),
    ).toMatchObject({ status: 422, code: "unsupported_content" });
    expect(
      errorOf(() =>
        employee.submitPost({ url: "https://youtube.com/watch?v=1" }, start),
      ),
    ).toMatchObject({ status: 422, code: "unsupported_platform" });
    expect(
      errorOf(() => employee.submitPost({ url: "not a link" }, start)),
    ).toMatchObject({ status: 422, code: "invalid_url" });
  });

  it("closes submissions after the challenge and its grace period", () => {
    const closed = new Date(Date.parse(state.campaign.endsAt) + 4 * DAY_MS);
    expect(errorOf(() => employee.submitPost({ url }, closed))).toMatchObject({
      status: 403,
      code: "challenge_closed",
    });
  });

  it("lets the owner withdraw only pending posts", () => {
    const post = employee.submitPost({ url }, start);
    employee.withdrawPost(post.id);
    expect(state.posts.some((candidate) => candidate.id === post.id)).toBe(
      false,
    );
    const approved = findPost(
      (candidate) =>
        candidate.employeeId === MOCK_CURRENT_USER_ID &&
        candidate.status === "approved",
    );
    expect(errorOf(() => employee.withdrawPost(approved.id))).toMatchObject({
      status: 409,
      code: "invalid_transition",
    });
  });

  it("limits the owner to one re-check every 10 minutes", () => {
    const post = employee.submitPost({ url }, start);
    employee.settle(later(CHECK_DELAY_MS + 1));
    employee.recheckPost(post.id, later(60_000));
    expect(
      errorOf(() => employee.recheckPost(post.id, later(5 * 60_000))),
    ).toMatchObject({ status: 429, code: "rate_limited" });
    expect(() =>
      employee.recheckPost(post.id, later(12 * 60_000)),
    ).not.toThrow();
  });
});

describe("moderation", () => {
  it("approves, disqualifies and reinstates with immediate effect on the board", () => {
    const post = findPost(
      (candidate) =>
        candidate.status === "pending" &&
        candidate.check.status === "passed" &&
        ["tiktok_video", "instagram_reel", "facebook_video"].includes(
          candidate.contentType,
        ) &&
        candidate.publishedAt !== null &&
        candidate.publishedAt >= state.campaign.startsAt,
    );
    const postCount = () =>
      admin
        .getLeaderboard(board(), start)
        .entries.find((entry) => entry.employee.id === post.employeeId)
        ?.postCount ?? 0;
    const before = postCount();

    admin.moderatePost(post.id, "approve", {}, start);
    expect(postCount()).toBe(before + 1);

    expect(
      errorOf(() =>
        admin.moderatePost(
          post.id,
          "disqualify",
          { reason: "fake_engagement" },
          start,
        ),
      ),
    ).toMatchObject({ status: 422, code: "validation_error" });
    const detail = admin.moderatePost(
      post.id,
      "disqualify",
      { reason: "fake_engagement", note: "Bought views" },
      start,
    );
    expect(detail).toMatchObject({
      status: "disqualified",
      statusReason: "fake_engagement",
      statusNote: "Bought views",
    });
    expect(postCount()).toBe(before);

    admin.moderatePost(
      post.id,
      "reinstate",
      { note: "Appeal accepted" },
      start,
    );
    expect(postCount()).toBe(before + 1);

    const events = admin
      .getAdminPost(post.id)
      .events.map((event) => event.action);
    expect(events.slice(0, 3)).toEqual(["reinstate", "disqualify", "approve"]);
  });

  it("approves a post whose check didn't pass in one step, and audits it", () => {
    const post = findPost(
      (candidate) =>
        candidate.status === "pending" && candidate.check.status === "failed",
    );
    const detail = admin.moderatePost(post.id, "approve", {}, start);
    expect(detail.status).toBe("approved");
    expect(detail.events[0]).toMatchObject({
      action: "approve_override",
      note: null,
      actor: { id: MOCK_CURRENT_USER_ID },
    });
  });

  it("rejects with a reason, reopens, and refuses invalid transitions", () => {
    const post = findPost((candidate) => candidate.status === "pending");
    expect(
      errorOf(() => admin.moderatePost(post.id, "reject", {}, start)),
    ).toMatchObject({ status: 422 });
    admin.moderatePost(post.id, "reject", { reason: "spam" }, start);
    expect(
      errorOf(() => admin.moderatePost(post.id, "disqualify", {}, start)),
    ).toMatchObject({ status: 409, code: "invalid_transition" });
    expect(admin.moderatePost(post.id, "reopen", {}, start).status).toBe(
      "pending",
    );
  });

  it("returns a result per post for bulk actions", () => {
    const passed = findPost(
      (candidate) =>
        candidate.status === "pending" && candidate.check.status === "passed",
    );
    const failed = findPost(
      (candidate) =>
        candidate.status === "pending" && candidate.check.status === "failed",
    );
    const approved = findPost((candidate) => candidate.status === "approved");
    const result = admin.bulkModerate(
      { ids: [passed.id, failed.id, approved.id], action: "approve" },
      start,
    );
    expect(result.results).toEqual([
      { id: passed.id, ok: true, error: null },
      { id: failed.id, ok: true, error: null },
      { id: approved.id, ok: false, error: "invalid_transition" },
    ]);
  });
});

describe("admin", () => {
  it("is forbidden for employees", () => {
    for (const call of [
      () => employee.getAdminPosts(queue(), null),
      () => employee.getSyncStatus(),
      () => employee.startSync(start),
      () =>
        employee.exportStandings({ category: "video", period: "all" }, start),
      () => employee.moderatePost(state.posts[0]!.id, "approve", {}, start),
    ])
      expect(errorOf(call)).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("lists the queue oldest pending first, with counts and paging", () => {
    const first = admin.getAdminPosts(queue(), null);
    const pending = state.posts.filter((post) => post.status === "pending");
    expect(first.counts.pending).toBe(pending.length);
    expect(first.counts.flagged).toBeGreaterThan(0);
    const times = first.posts.map((post) => post.submittedAt);
    expect(times).toEqual([...times].sort());
    if (first.nextCursor) {
      const next = admin.getAdminPosts(queue(), first.nextCursor);
      expect(next.posts[0]!.submittedAt >= times.at(-1)!).toBe(true);
    }
  });

  it("searches by email and handle", () => {
    const byEmail = admin.getAdminPosts(
      queue({ status: "approved", q: "nino.beridze@" }),
      null,
    );
    expect(byEmail.posts.length).toBeGreaterThan(0);
    expect(
      byEmail.posts.every((post) => post.employee.email.startsWith("nino.")),
    ).toBe(true);
    const byHandle = admin.getAdminPosts(
      queue({ status: "pending", q: "saba.second" }),
      null,
    );
    expect(byHandle.posts.map((post) => post.employee.name)).toContain(
      "Saba Mchedlishvili",
    );
  });

  it("edits metrics manually, keeps them through a sync while locked, and audits it", () => {
    const post = findPost(
      (candidate) =>
        candidate.status === "approved" &&
        candidate.contentType === "tiktok_video" &&
        candidate.truth.error === null &&
        candidate.publishedAt !== null &&
        candidate.publishedAt >= state.campaign.startsAt,
    );
    const detail = admin.updateAdminPost(
      post.id,
      {
        views: 12_345,
        reactions: 678,
        metricsLocked: true,
        note: "From analytics",
      },
      start,
    );
    expect(detail).toMatchObject({
      views: 12_345,
      reactions: 678,
      score: 13_023,
      metricsSource: "manual",
      metricsLocked: true,
    });
    admin.startSync(later(60_000));
    expect(admin.getAdminPost(post.id)).toMatchObject({
      views: 12_345,
      reactions: 678,
    });
    expect(
      admin.getAdminPost(post.id).events.map((event) => event.action),
    ).toEqual(expect.arrayContaining(["edit_metrics", "lock_metrics"]));
  });

  it("refuses views on static posts and content types from another platform", () => {
    const post = findPost(
      (candidate) => candidate.contentType === "linkedin_post",
    );
    expect(
      errorOf(() => admin.updateAdminPost(post.id, { views: 10 }, start)),
    ).toMatchObject({ status: 422 });
    expect(
      errorOf(() =>
        admin.updateAdminPost(post.id, { contentType: "tiktok_video" }, start),
      ),
    ).toMatchObject({ status: 422 });
  });

  it("rate-limits manual syncs to one every 15 minutes", () => {
    admin.startSync(start);
    expect(errorOf(() => admin.startSync(later(5 * 60_000)))).toMatchObject({
      status: 429,
    });
    expect(admin.getSyncStatus().runs[0]?.trigger).toBe("manual");
  });

  it("exports standings as CSV, as of a chosen time", () => {
    const csv = admin.exportStandings(
      { category: "video", period: "all" },
      start,
    );
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "rank,name,email,department,posts,views,reactions,score,post_urls",
    );
    const total = admin.getLeaderboard(board(), start).totalParticipants;
    expect(lines).toHaveLength(total + 1);
    const earlier = admin.exportStandings(
      {
        category: "video",
        period: "all",
        asOf: new Date(start.getTime() - 10 * DAY_MS).toISOString(),
      },
      start,
    );
    expect(earlier.trim().split("\r\n").length).toBeLessThanOrEqual(total + 1);
  });
});

describe("rounds", () => {
  it("seeds weekly and monthly rounds and shows the current one", () => {
    const { rounds, challenge } = admin.getRounds();
    expect(challenge.source).toBe("default");
    expect(
      rounds.filter((round) => round.kind === "week").length,
    ).toBeGreaterThan(10);
    expect(
      rounds.filter((round) => round.kind === "month").length,
    ).toBeGreaterThan(2);
    const week = admin.getLeaderboard(board({ period: "week" }), start);
    expect(week.period.round).toMatchObject({ kind: "week" });
    expect(week.period.isCurrent).toBe(true);
  });

  it("opens a past round by id and refuses overlapping rounds", () => {
    const first = admin
      .getRounds()
      .rounds.find((round) => round.kind === "week")!;
    const past = admin.getLeaderboard(
      board({ period: "week", round: first.id }),
      start,
    );
    expect(past.period).toMatchObject({
      isCurrent: false,
      round: { id: first.id, number: 1 },
    });
    expect(past.query.round).toBe(first.id);
    expect(
      errorOf(() =>
        admin.createRound({
          kind: "week",
          name: null,
          startDate: first.startDate,
          endDate: first.endDate,
        }),
      ),
    ).toMatchObject({ status: 422, code: "round_overlap" });
    expect(errorOf(() => admin.generateRounds("week"))).toMatchObject({
      status: 409,
      code: "rounds_exist",
    });
    expect(
      errorOf(() =>
        employee.createRound({
          kind: "month",
          name: null,
          startDate: first.startDate,
          endDate: first.endDate,
        }),
      ),
    ).toMatchObject({ status: 403 });
  });

  it("lets admins rename, move and delete rounds and change the challenge", () => {
    const month = admin
      .getRounds()
      .rounds.find((round) => round.kind === "month")!;
    const renamed = admin.updateRound(month.id, { name: "Kickoff month" });
    expect(renamed.name).toBe("Kickoff month");
    admin.deleteRound(month.id);
    expect(
      admin.getRounds().rounds.some((round) => round.id === month.id),
    ).toBe(false);
    const challenge = admin.updateChallenge({
      startDate: admin.getRounds().challenge.startDate,
      endDate: "2027-02-28",
    });
    expect(challenge).toMatchObject({ source: "admin", endDate: "2027-02-28" });
  });
});
