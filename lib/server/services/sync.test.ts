import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import { makeEmployee, makePost, resetDb, testConfig } from "@/test/factories";
import type { FetchedPost, FetchOutcome, PostRef } from "@/lib/post-data";
import type { Db } from "@/lib/server/db/client";
import {
  moderationEvents,
  postMetricSnapshots,
  posts,
  syncRuns,
} from "@/lib/server/db/schema";
import type { PostDataProvider } from "@/lib/server/providers";
import {
  claimRun,
  REFRESH_EVERY_MS,
  runSync,
  STALE_RUN_MS,
} from "@/lib/server/services/sync";

let db: Db;
let close: () => Promise<void>;
const now = new Date("2026-10-20T08:00:00+04:00");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

/** A provider whose answer per post the test decides. */
function provider(
  answer: (ref: PostRef) => FetchOutcome,
  id = "test",
): PostDataProvider & { calls: PostRef[][] } {
  const calls: PostRef[][] = [];
  return {
    id,
    calls,
    async fetchMany(refs) {
      calls.push(refs);
      return new Map(refs.map((ref) => [ref.url, answer(ref)]));
    },
  };
}

const fetched = (overrides: Partial<FetchedPost> = {}): FetchOutcome => ({
  ok: true,
  post: {
    canonicalUrl: null,
    externalId: null,
    mediaKind: "video",
    caption: "Our day #CrocoBySquad",
    hashtags: [],
    mentions: [],
    authorHandle: "ana",
    authorName: null,
    publishedAt: null,
    views: 2000,
    reactions: 150,
    thumbnailUrl: null,
    raw: { sample: true },
    ...overrides,
  },
});

const failure: FetchOutcome = { ok: false, error: "private", retryable: false };

const options = (answer: PostDataProvider, extra = {}) => ({
  trigger: "cron" as const,
  now,
  clock: () => now,
  providerFor: () => answer,
  ...extra,
});

describe("runSync", () => {
  it("refreshes active posts, stores snapshots and records the run", async () => {
    const ana = await makeEmployee(db);
    const approved = await makePost(db, ana.id, "tiktok_video", {
      views: 100,
      reactions: 10,
    });
    const pending = await makePost(db, ana.id, "instagram_reel", {
      status: "pending",
      checkStatus: "queued",
    });
    await makePost(db, ana.id, "tiktok_video", { status: "rejected" });
    await makePost(db, ana.id, "tiktok_video", { status: "disqualified" });

    const result = await runSync(
      db,
      testConfig,
      options(provider(() => fetched())),
    );
    expect(result).toMatchObject({
      status: "done",
      stoppedEarly: false,
      run: {
        trigger: "cron",
        postsTotal: 2,
        postsOk: 2,
        postsFailed: 0,
        error: null,
      },
    });
    for (const id of [approved.id, pending.id]) {
      const row = await db.query.posts.findFirst({ where: eq(posts.id, id) });
      expect(row).toMatchObject({
        views: 2000,
        reactions: 150,
        metricsFetchedAt: now,
      });
    }
    expect(await db.select().from(postMetricSnapshots)).toHaveLength(2);
    const events = await db
      .select({ action: moderationEvents.action })
      .from(moderationEvents)
      .where(eq(moderationEvents.postId, pending.id));
    expect(events.map((event) => event.action)).toContain("check_passed");
  });

  it("skips posts fetched in the last 6 hours unless forced", async () => {
    const ana = await makeEmployee(db);
    await makePost(db, ana.id, "tiktok_video", {
      metricsFetchedAt: new Date(now.getTime() - REFRESH_EVERY_MS + 60_000),
    });
    const answer = provider(() => fetched());
    expect(
      (await runSync(db, testConfig, options(answer))).status === "done" &&
        answer.calls.length,
    ).toBe(0);
    await runSync(
      db,
      testConfig,
      options(answer, { force: true, trigger: "manual" }),
    );
    expect(answer.calls.flat()).toHaveLength(1);
  });

  it("never runs twice at once; a crashed run stops blocking after 15 minutes", async () => {
    const first = await claimRun(db, "cron", now);
    expect(first).not.toBeNull();
    expect(
      await claimRun(db, "manual", new Date(now.getTime() + 60_000)),
    ).toBeNull();
    expect(
      await runSync(db, testConfig, options(provider(() => fetched()))),
    ).toEqual({ status: "skipped", reason: "already_running" });
    expect(
      await claimRun(db, "cron", new Date(now.getTime() + STALE_RUN_MS + 1)),
    ).not.toBeNull();
  });

  it("keeps the last values on failures, flags unavailable after 3, then backs off", async () => {
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      views: 500,
      reactions: 20,
      consecutiveFetchFailures: 2,
    });
    const failing = provider(() => failure);
    const result = await runSync(db, testConfig, options(failing));
    expect(result.status === "done" && result.run.postsFailed).toBe(1);
    const row = await db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(row).toMatchObject({
      views: 500,
      reactions: 20,
      consecutiveFetchFailures: 3,
      checkStatus: "error",
    });
    expect(row?.flags).toContain("unavailable");
    expect(await db.select().from(postMetricSnapshots)).toEqual([]);

    // Retried at most once a day from now on.
    await runSync(
      db,
      testConfig,
      options(failing, { now: new Date(now.getTime() + 12 * 3_600_000) }),
    );
    expect(failing.calls).toHaveLength(1);
  });

  it("keeps locked numbers but records the snapshot", async () => {
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "tiktok_video", {
      views: 9999,
      reactions: 999,
      metricsLocked: true,
      metricsSource: "manual",
    });
    await runSync(db, testConfig, options(provider(() => fetched())));
    const row = await db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(row).toMatchObject({
      views: 9999,
      reactions: 999,
      metricsSource: "manual",
    });
    const [snapshot] = await db.select().from(postMetricSnapshots);
    expect(snapshot).toMatchObject({
      views: 2000,
      reactions: 150,
      source: "provider",
    });
  });

  it("flags an approved post that lost its tag, without disqualifying it", async () => {
    const ana = await makeEmployee(db);
    const post = await makePost(db, ana.id, "instagram_reel");
    await runSync(
      db,
      testConfig,
      options(provider(() => fetched({ caption: "No tag any more" }))),
    );
    const row = await db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(row?.status).toBe("approved");
    expect(row?.flags).toContain("tag_removed");
  });

  it("skips platforms on manual entry, posts outside the window, and stops after the grace period", async () => {
    const ana = await makeEmployee(db);
    await makePost(db, ana.id, "linkedin_post");
    await makePost(db, ana.id, "tiktok_video", {
      publishedAt: new Date("2026-09-20T12:00:00+04:00"),
    });
    const manual = provider(() => fetched(), "manual");
    await runSync(db, testConfig, options(manual));
    expect(manual.calls).toEqual([]);

    const answer = provider(() => fetched());
    const result = await runSync(
      db,
      testConfig,
      options(answer, { now: new Date("2027-01-04T08:00:00+04:00") }),
    );
    expect(answer.calls).toEqual([]);
    expect(result.status === "done" && result.run.postsTotal).toBe(0);
  });

  it("stops starting batches after the deadline", async () => {
    const ana = await makeEmployee(db);
    await makePost(db, ana.id, "tiktok_video");
    const answer = provider(() => fetched());
    const result = await runSync(
      db,
      testConfig,
      options(answer, { deadline: Date.now() - 1 }),
    );
    expect(result).toMatchObject({ status: "done", stoppedEarly: true });
    expect(answer.calls).toEqual([]);
    const [run] = await db.select().from(syncRuns);
    expect(run?.finishedAt).not.toBeNull();
  });

  it("adopts the real link of an unresolved short link, and rejects a duplicate", async () => {
    const ana = await makeEmployee(db);
    const original = await makePost(db, ana.id, "tiktok_video", {
      urlCanonical: "https://tiktok.com/@ana/video/7412345678901234567",
      externalId: "7412345678901234567",
    });
    const short = await makePost(db, ana.id, "tiktok_video", {
      status: "pending",
      urlCanonical: "https://vm.tiktok.com/ZMshort1",
      externalId: null,
    });
    const other = await makePost(db, ana.id, "tiktok_video", {
      status: "pending",
      urlCanonical: "https://vm.tiktok.com/ZMshort2",
      externalId: null,
    });
    const answer = provider((ref) =>
      fetched({
        canonicalUrl:
          ref.url === short.urlCanonical
            ? `${original.urlCanonical}?is_from_webapp=1`
            : "https://www.tiktok.com/@ana/video/7499999999999999999",
      }),
    );
    await runSync(db, testConfig, options(answer));

    const duplicate = await db.query.posts.findFirst({
      where: eq(posts.id, short.id),
    });
    expect(duplicate).toMatchObject({
      status: "rejected",
      statusReason: "duplicate",
      urlCanonical: "https://vm.tiktok.com/ZMshort1",
    });
    const adopted = await db.query.posts.findFirst({
      where: eq(posts.id, other.id),
    });
    expect(adopted).toMatchObject({
      status: "pending",
      urlCanonical: "https://tiktok.com/@ana/video/7499999999999999999",
      externalId: "7499999999999999999",
    });
  });
});
