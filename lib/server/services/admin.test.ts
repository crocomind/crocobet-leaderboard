import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import type { AdminPostsQuery } from "@/lib/api/types";
import type { Db } from "@/lib/server/db/client";
import {
  moderationEvents,
  postMetricSnapshots,
  posts,
  socialAccounts,
  syncRuns,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import {
  bulkModerate,
  deleteAdminPost,
  exportStandings,
  getAdminPostDetail,
  listAdminPosts,
  moderatePost,
  startManualSync,
  updateAdminPost,
} from "@/lib/server/services/admin";
import { getLeaderboard } from "@/lib/server/services/leaderboard";

let db: Db;
let close: () => Promise<void>;
const now = new Date("2026-10-20T10:00:00+04:00");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

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

const query = (overrides: Partial<AdminPostsQuery> = {}): AdminPostsQuery => ({
  status: "pending",
  check: "all",
  flag: "all",
  category: "all",
  platform: "all",
  q: "",
  ...overrides,
});

const board = () =>
  getLeaderboard(
    db,
    testConfig,
    {
      category: "video",
      platform: "all",
      period: "all",
      round: null,
      search: "",
    },
    "nobody",
    later(60),
  );

describe("moderation", () => {
  it("approves, disqualifies and reinstates, audited, with immediate effect on the board", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      status: "pending",
      approvedAt: null,
      views: 1000,
      reactions: 50,
      authorHandle: "ana.tiktok",
    });
    expect((await board()).totalParticipants).toBe(0);

    const approved = await moderatePost(db, admin, post.id, "approve", {}, now);
    expect(approved).toMatchObject({
      status: "approved",
      reviewedBy: { id: admin.id },
      reviewedAt: now.toISOString(),
    });
    expect((await board()).entries[0]?.score).toBe(1050);
    // The first approved post links its author handle.
    expect(await db.select().from(socialAccounts)).toMatchObject([
      { employeeId: ana.id, platform: "tiktok", handle: "ana.tiktok" },
    ]);

    expect(
      await failure(() =>
        moderatePost(
          db,
          admin,
          post.id,
          "disqualify",
          { reason: "spam" },
          later(1),
        ),
      ),
    ).toEqual({ status: 422, code: "validation_error" });
    const disqualified = await moderatePost(
      db,
      admin,
      post.id,
      "disqualify",
      { reason: "fake_engagement", note: "Views bought overnight" },
      later(2),
    );
    expect(disqualified).toMatchObject({
      status: "disqualified",
      statusReason: "fake_engagement",
      statusNote: "Views bought overnight",
    });
    expect((await board()).totalParticipants).toBe(0);

    await moderatePost(
      db,
      admin,
      post.id,
      "reinstate",
      { note: "Appeal OK" },
      later(3),
    );
    expect((await board()).totalParticipants).toBe(1);

    const events = await db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.postId, post.id))
      .orderBy(moderationEvents.createdAt);
    expect(
      events.map(({ action, actorId, reason, before, after }) => ({
        action,
        actorId,
        reason,
        before,
        after,
      })),
    ).toEqual([
      {
        action: "approve",
        actorId: admin.id,
        reason: null,
        before: { status: "pending", statusReason: null, statusNote: null },
        after: { status: "approved", statusReason: null, statusNote: null },
      },
      {
        action: "disqualify",
        actorId: admin.id,
        reason: "fake_engagement",
        before: { status: "approved", statusReason: null, statusNote: null },
        after: {
          status: "disqualified",
          statusReason: "fake_engagement",
          statusNote: "Views bought overnight",
        },
      },
      {
        action: "reinstate",
        actorId: admin.id,
        reason: null,
        before: {
          status: "disqualified",
          statusReason: "fake_engagement",
          statusNote: "Views bought overnight",
        },
        after: { status: "approved", statusReason: null, statusNote: null },
      },
    ]);
  });

  it("approves a post whose check didn't pass in one step, and audits it", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "instagram_reel", {
      status: "pending",
      checkStatus: "failed",
    });
    const detail = await moderatePost(db, admin, post.id, "approve", {}, now);
    expect(detail.status).toBe("approved");
    expect(detail.events[0]).toMatchObject({
      action: "approve_override",
      note: null,
      actor: { id: admin.id },
    });
  });

  it("rejects with a reason, reopens, and refuses other transitions with 409", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "instagram_reel", {
      status: "pending",
    });
    expect(
      await failure(() => moderatePost(db, admin, post.id, "reject", {}, now)),
    ).toEqual({
      status: 422,
      code: "validation_error",
    });
    await moderatePost(
      db,
      admin,
      post.id,
      "reject",
      { reason: "missing_tag" },
      now,
    );
    expect(
      await failure(() =>
        moderatePost(
          db,
          admin,
          post.id,
          "disqualify",
          { reason: "spam", note: "x" },
          now,
        ),
      ),
    ).toEqual({ status: 409, code: "invalid_transition" });
    const reopened = await moderatePost(
      db,
      admin,
      post.id,
      "reopen",
      {},
      later(1),
    );
    expect(reopened).toMatchObject({ status: "pending", statusReason: null });
  });

  it("returns a result per post for bulk actions", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const passed = await makePost(db, ana.id, "tiktok_video", {
      status: "pending",
    });
    const failed = await makePost(db, ana.id, "tiktok_video", {
      status: "pending",
      checkStatus: "failed",
    });
    const approved = await makePost(db, ana.id, "tiktok_video", {
      status: "approved",
    });
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(
      await bulkModerate(
        db,
        admin,
        {
          ids: [passed.id, failed.id, approved.id, missing],
          action: "approve",
        },
        now,
      ),
    ).toEqual({
      results: [
        { id: passed.id, ok: true, error: null },
        { id: failed.id, ok: true, error: null },
        { id: approved.id, ok: false, error: "invalid_transition" },
        { id: missing, ok: false, error: "not_found" },
      ],
    });
  });
});

describe("delete", () => {
  it("removes a post entirely, with its snapshots and events", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      status: "disqualified",
    });
    await moderatePost(
      db,
      admin,
      post.id,
      "reinstate",
      { note: "Looks fine" },
      new Date(),
    );
    await db
      .insert(postMetricSnapshots)
      .values({ postId: post.id, views: 10, reactions: 1, source: "manual" });
    await deleteAdminPost(db, post.id);
    expect(
      await db.query.posts.findFirst({ where: eq(posts.id, post.id) }),
    ).toBeUndefined();
    expect(
      await db
        .select()
        .from(moderationEvents)
        .where(eq(moderationEvents.postId, post.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(postMetricSnapshots)
        .where(eq(postMetricSnapshots.postId, post.id)),
    ).toEqual([]);
    await expect(deleteAdminPost(db, post.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("overrides", () => {
  it("edits numbers, locks them, and audits every change", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      views: null,
      reactions: 10,
      flags: ["metrics_unavailable"],
    });
    const detail = await updateAdminPost(
      db,
      testConfig,
      admin,
      post.id,
      {
        views: 4200,
        reactions: 300,
        metricsLocked: true,
        note: "From analytics",
      },
      now,
    );
    expect(detail).toMatchObject({
      views: 4200,
      reactions: 300,
      score: 4500,
      metricsSource: "manual",
      metricsLocked: true,
      flags: [],
    });
    expect(detail.snapshots.at(-1)).toMatchObject({
      views: 4200,
      reactions: 300,
      source: "manual",
    });
    expect(detail.events.map((event) => event.action).sort()).toEqual([
      "edit_metrics",
      "lock_metrics",
    ]);
    expect(
      detail.events.every((event) => event.note === "From analytics"),
    ).toBe(true);
  });

  it("changes the publish date and content type, within the platform", async () => {
    const admin = await makeEmployee(db, { role: "admin" });
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "instagram_photo", {
      views: null,
      reactions: 30,
      publishedAtSource: "submitter",
      flags: ["published_date_uncertain"],
      checkDetails: {
        tagFound: true,
        matched: ["#crocobysquad"],
        authorHandle: null,
        ownerMatch: null,
        publishedInWindow: true,
        error: null,
      },
    });
    const detail = await updateAdminPost(
      db,
      testConfig,
      admin,
      post.id,
      {
        contentType: "instagram_reel",
        publishedAt: "2026-09-25T10:00:00+04:00",
      },
      now,
    );
    expect(detail).toMatchObject({
      contentType: "instagram_reel",
      category: "video",
      publishedAt: "2026-09-25T06:00:00.000Z",
      publishedAtSource: "admin",
      flags: [],
      check: { publishedInWindow: false },
    });
    expect(
      await failure(() =>
        updateAdminPost(
          db,
          testConfig,
          admin,
          post.id,
          { contentType: "tiktok_video" },
          now,
        ),
      ),
    ).toEqual({ status: 422, code: "validation_error" });
    expect(
      await failure(() =>
        updateAdminPost(
          db,
          testConfig,
          admin,
          post.id,
          { contentType: "instagram_photo", views: 5 },
          now,
        ),
      ),
    ).toEqual({ status: 422, code: "validation_error" });
    expect(
      await failure(() =>
        updateAdminPost(
          db,
          testConfig,
          admin,
          post.id,
          { publishedAt: "2026-10-21T10:00:00+04:00" },
          now,
        ),
      ),
    ).toEqual({ status: 422, code: "validation_error" });
  });
});

describe("queue", () => {
  it("orders reviewed tabs by submission time, not review time", async () => {
    const ana = await makeEmployee(db);
    const older = await makePost(db, ana.id, "instagram_reel", {
      submittedAt: new Date("2026-10-12T09:00:00+04:00"),
      reviewedAt: new Date("2026-10-14T09:00:00+04:00"),
    });
    const newer = await makePost(db, ana.id, "instagram_reel", {
      submittedAt: new Date("2026-10-13T09:00:00+04:00"),
      reviewedAt: new Date("2026-10-13T10:00:00+04:00"),
    });
    const approved = await listAdminPosts(
      db,
      query({ status: "approved" }),
      null,
    );
    expect(approved.posts.map((post) => post.id)).toEqual([newer.id, older.id]);
  });

  it("lists tabs with counts, newest first, filters, search and pages", async () => {
    const ana = await makeEmployee(db, {
      email: "ana@crocobet.com",
      givenName: "Ana",
      familyName: "Gelashvili",
    });
    const nino = await makeEmployee(db, {
      email: "nino@crocobet.com",
      displayName: "Nino",
    });
    await db.insert(socialAccounts).values({
      employeeId: nino.id,
      platform: "tiktok",
      handle: "nino.creates",
    });
    for (let i = 0; i < 22; i++)
      await makePost(db, ana.id, "instagram_reel", {
        status: "pending",
        submittedAt: new Date(now.getTime() - (30 - i) * 3_600_000),
      });
    await makePost(db, nino.id, "tiktok_video", {
      status: "pending",
      checkStatus: "failed",
      flags: ["author_mismatch"],
      submittedAt: new Date(now.getTime() - 3_600_000),
    });
    await makePost(db, nino.id, "linkedin_post", { status: "approved" });
    await makePost(db, nino.id, "linkedin_post", {
      status: "rejected",
      flags: ["unavailable"],
    });

    const first = await listAdminPosts(db, query(), null);
    expect(first.counts).toEqual({
      pending: 23,
      approved: 1,
      rejected: 1,
      disqualified: 0,
      flagged: 1,
    });
    expect(first.posts).toHaveLength(20);
    const times = first.posts.map((post) => post.submittedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(first.posts[0]?.employee).toMatchObject({ name: "Nino" });
    expect(first.posts[1]?.employee).toMatchObject({
      name: "Ana Gelashvili",
      email: "ana@crocobet.com",
    });
    const second = await listAdminPosts(db, query(), first.nextCursor);
    expect(second.posts).toHaveLength(3);
    expect(second.nextCursor).toBeNull();

    const byHandle = await listAdminPosts(
      db,
      query({ q: "nino.creates" }),
      null,
    );
    expect(byHandle.posts.map((post) => post.employee.name)).toEqual(["Nino"]);
    expect(byHandle.counts.pending).toBe(1);
    const byName = await listAdminPosts(db, query({ q: "gelash" }), null);
    expect(byName.counts.pending).toBe(22);
    const failedChecks = await listAdminPosts(
      db,
      query({ check: "failed" }),
      null,
    );
    expect(failedChecks.posts).toHaveLength(1);
    const flaggedTab = await listAdminPosts(
      db,
      query({ status: "flagged" }),
      null,
    );
    expect(flaggedTab.posts.map((post) => post.flags)).toEqual([
      ["author_mismatch"],
    ]);
    const staticOnly = await listAdminPosts(
      db,
      query({ status: "approved", category: "static" }),
      null,
    );
    expect(staticOnly.posts.map((post) => post.contentType)).toEqual([
      "linkedin_post",
    ]);
    // LIKE wildcards in the search are taken literally.
    expect(
      (await listAdminPosts(db, query({ q: "%" }), null)).counts.pending,
    ).toBe(0);
  });

  it("returns the detail with snapshots, events and linked handles", async () => {
    const ana = await makeEmployee(db);
    const other = await makeEmployee(db);
    await db.insert(socialAccounts).values([
      { employeeId: ana.id, platform: "tiktok", handle: "ana.real" },
      { employeeId: other.id, platform: "tiktok", handle: "borrowed" },
      { employeeId: ana.id, platform: "instagram", handle: "ana.ig" },
    ]);
    const post = await makePost(db, ana.id, "tiktok_video", {
      authorHandle: "borrowed",
      snapshots: [
        { at: new Date(now.getTime() - 7_200_000), views: 10, reactions: 1 },
        { at: new Date(now.getTime() - 3_600_000), views: 20, reactions: 2 },
      ],
    });
    await db
      .insert(moderationEvents)
      .values({ postId: post.id, action: "submitted" });
    const detail = await getAdminPostDetail(db, post.id);
    expect(detail.snapshots.map((snapshot) => snapshot.views)).toEqual([
      10, 20,
    ]);
    expect(detail.events).toMatchObject([{ action: "submitted", actor: null }]);
    expect(detail.linkedHandles.map((handle) => handle.handle).sort()).toEqual([
      "ana.real",
      "borrowed",
    ]);
  });
});

describe("sync and export", () => {
  it("allows one manual sync every 15 minutes", async () => {
    const tasks: (() => Promise<unknown>)[] = [];
    const run = await startManualSync(db, testConfig, now, (task) =>
      tasks.push(task),
    );
    expect(run).toMatchObject({ trigger: "manual", finishedAt: null });
    await Promise.all(tasks.map((task) => task()));
    const [finished] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, run.id));
    expect(finished?.finishedAt).not.toBeNull();
    expect(
      await failure(() => startManualSync(db, testConfig, later(5), () => {})),
    ).toEqual({ status: 429, code: "rate_limited" });
  });

  it("exports standings for a week, as of a chosen time, with emails", async () => {
    const ana = await makeEmployee(db, {
      email: "ana@crocobet.com",
      givenName: "Ana",
      familyName: "Gelashvili",
    });
    const beka = await makeEmployee(db, {
      email: "beka@crocobet.com",
      displayName: "=cmd()",
    });
    const week = new Date("2026-10-14T12:00:00+04:00");
    const anaPost = await makePost(db, ana.id, "tiktok_video", {
      publishedAt: week,
      approvedAt: new Date("2026-10-14T18:00:00+04:00"),
      views: 5000,
      reactions: 500,
      snapshots: [
        {
          at: new Date("2026-10-15T08:00:00+04:00"),
          views: 1000,
          reactions: 100,
        },
        {
          at: new Date("2026-10-19T08:00:00+04:00"),
          views: 5000,
          reactions: 500,
        },
      ],
    });
    await makePost(db, beka.id, "instagram_reel", {
      publishedAt: week,
      approvedAt: new Date("2026-10-14T18:00:00+04:00"),
      views: 2000,
      reactions: 0,
      snapshots: [
        {
          at: new Date("2026-10-15T08:00:00+04:00"),
          views: 2000,
          reactions: 0,
        },
      ],
    });
    const { filename, csv } = await exportStandings(
      db,
      testConfig,
      {
        category: "video",
        period: "week",
        periodStart: "2026-10-13",
        asOf: "2026-10-16T00:00:00+04:00",
      },
      now,
    );
    expect(filename).toBe("croco-standings-video-week-2026-10-12.csv");
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toEqual([
      "rank,name,email,department,posts,views,reactions,score,post_urls",
      `1,'=cmd(),beka@crocobet.com,,1,2000,0,2000,${await urlOf(beka.id)}`,
      `2,Ana Gelashvili,ana@crocobet.com,,1,1000,100,1100,${anaPost.urlCanonical}`,
    ]);
    expect(await db.select().from(postMetricSnapshots)).toHaveLength(3);
  });
});

async function urlOf(employeeId: string) {
  const [row] = await db
    .select()
    .from(posts)
    .where(eq(posts.employeeId, employeeId));
  return row!.urlCanonical;
}
