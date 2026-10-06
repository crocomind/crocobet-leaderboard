import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import {
  makeEmployee,
  makePost,
  resetDb,
  serviceContext,
  testConfig,
} from "@/test/factories";
import { parseServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  moderationEvents,
  postMetricSnapshots,
  posts,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import {
  getEmployeePosts,
  getMyPosts,
  recheckPost,
  submitPost,
  SUBMISSIONS_PER_DAY,
  withdrawPost,
} from "@/lib/server/services/posts";

let db: Db;
let close: () => Promise<void>;
const now = new Date("2026-10-20T10:00:00+04:00");

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

describe("submitPost", () => {
  it("stores a pending post with a queued check, then runs the check", async () => {
    const employee = await makeEmployee(db);
    const context = serviceContext(db, now);
    const post = await submitPost(context, employee, {
      url: "https://www.instagram.com/reel/AbCdEf123/?igsh=xyz",
      title: "Team lunch",
      postedAt: "2026-10-19",
    });
    expect(post).toMatchObject({
      url: "https://instagram.com/reel/AbCdEf123",
      platform: "instagram",
      contentType: "instagram_reel",
      category: "video",
      status: "pending",
      title: "Team lunch",
      check: { status: "queued" },
    });
    const [event] = await db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.postId, post.id));
    expect(event).toMatchObject({ action: "submitted", actorId: employee.id });

    await context.flush();
    const row = await db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(row?.checkStatus).not.toBe("queued");
    expect(row?.checkedAt).toEqual(now);
    const actions = (
      await db
        .select({ action: moderationEvents.action })
        .from(moderationEvents)
        .where(eq(moderationEvents.postId, post.id))
    ).map((event) => event.action);
    expect(actions.some((action) => action.startsWith("check_"))).toBe(true);
    if (row?.checkStatus !== "error") {
      const snapshots = await db
        .select()
        .from(postMetricSnapshots)
        .where(eq(postMetricSnapshots.postId, post.id));
      expect(snapshots).toHaveLength(1);
    }
  });

  it("rejects the same post through another link variant, from anyone", async () => {
    const ana = await makeEmployee(db);
    const nino = await makeEmployee(db);
    await submitPost(serviceContext(db, now), ana, {
      url: "https://instagram.com/reel/SameOne1",
    });
    expect(
      await failure(() =>
        submitPost(serviceContext(db, now), nino, {
          url: "https://www.instagram.com/reels/SameOne1/?utm_source=ig",
        }),
      ),
    ).toEqual({ status: 409, code: "duplicate_post" });
  });

  it("maps link problems to the contract's codes", async () => {
    const employee = await makeEmployee(db);
    const submit = (url: string) =>
      failure(() => submitPost(serviceContext(db, now), employee, { url }));
    expect(await submit("https://instagram.com/stories/someone/123")).toEqual({
      status: 422,
      code: "unsupported_content",
    });
    expect(await submit("https://youtube.com/watch?v=1")).toEqual({
      status: 422,
      code: "unsupported_platform",
    });
    expect(await submit("https://tiktok.com/@someone")).toEqual({
      status: 422,
      code: "unsupported_content",
    });
    expect(await submit("nonsense")).toEqual({
      status: 422,
      code: "invalid_url",
    });
  });

  it("closes submissions after the challenge and its grace days", async () => {
    const employee = await makeEmployee(db);
    const afterGrace = new Date("2027-01-04T00:00:01+04:00");
    expect(
      await failure(() =>
        submitPost(serviceContext(db, afterGrace), employee, {
          url: "https://tiktok.com/@a/video/7400000000000000000",
        }),
      ),
    ).toEqual({ status: 403, code: "challenge_closed" });
    const withinGrace = new Date("2027-01-03T23:00:00+04:00");
    await expect(
      submitPost(serviceContext(db, withinGrace), employee, {
        url: "https://tiktok.com/@a/video/7400000000000000001",
      }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("refuses a posted date in the future (in Tbilisi time)", async () => {
    const employee = await makeEmployee(db);
    expect(
      await failure(() =>
        submitPost(serviceContext(db, now), employee, {
          url: "https://instagram.com/p/Photo1",
          postedAt: "2026-10-21",
        }),
      ),
    ).toEqual({ status: 422, code: "validation_error" });
  });

  it(`allows ${SUBMISSIONS_PER_DAY} submissions per employee per day`, async () => {
    const employee = await makeEmployee(db);
    for (let i = 0; i < SUBMISSIONS_PER_DAY; i++)
      await submitPost(serviceContext(db, now), employee, {
        url: `https://instagram.com/p/Daily${i}`,
      });
    expect(
      await failure(() =>
        submitPost(serviceContext(db, now), employee, {
          url: "https://instagram.com/p/OneTooMany",
        }),
      ),
    ).toEqual({ status: 429, code: "rate_limited" });
  });

  it("stores a check error when the platform's provider is manual", async () => {
    const employee = await makeEmployee(db);
    const config = parseServerConfig({
      CHALLENGE_STARTS_AT: "2026-10-01T00:00:00+04:00",
      CHALLENGE_ENDS_AT: "2027-01-01T00:00:00+04:00",
      POST_DATA_PROVIDER_LINKEDIN: "manual",
    });
    const context = serviceContext(db, now, config);
    const post = await submitPost(context, employee, {
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7384000000000000000/",
    });
    await context.flush();
    const row = await db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(row).toMatchObject({
      checkStatus: "error",
      checkDetails: expect.objectContaining({ error: "unsupported" }),
    });
  });
});

describe("short links", () => {
  it("resolves a short link before storing and deduplicating it", async () => {
    const employee = await makeEmployee(db);
    const resolveLink = async () => ({
      ok: true as const,
      url: "https://www.tiktok.com/@ana/video/7412345678901234567?_r=1",
    });
    const post = await submitPost(
      serviceContext(db, now),
      employee,
      { url: "https://vm.tiktok.com/ZMabc123/" },
      { resolveLink },
    );
    expect(post.url).toBe("https://tiktok.com/@ana/video/7412345678901234567");
    expect(
      await failure(() =>
        submitPost(
          serviceContext(db, now),
          employee,
          { url: "https://vm.tiktok.com/ZMother9/" },
          { resolveLink },
        ),
      ),
    ).toEqual({ status: 409, code: "duplicate_post" });
  });

  it("accepts the short link as is when it can't be resolved", async () => {
    const employee = await makeEmployee(db);
    const post = await submitPost(
      serviceContext(db, now),
      employee,
      { url: "https://vm.tiktok.com/ZMslow1/" },
      { resolveLink: async () => ({ ok: false, reason: "timeout" }) },
    );
    expect(post.url).toBe("https://vm.tiktok.com/ZMslow1");
  });

  it("refuses a short link that leads to a story or profile", async () => {
    const employee = await makeEmployee(db);
    expect(
      await failure(() =>
        submitPost(
          serviceContext(db, now),
          employee,
          { url: "https://vm.tiktok.com/ZMprof1/" },
          {
            resolveLink: async () => ({
              ok: true,
              url: "https://www.tiktok.com/@ana",
            }),
          },
        ),
      ),
    ).toEqual({ status: 422, code: "unsupported_content" });
  });
});

describe("withdraw and re-check", () => {
  it("lets the owner withdraw only their pending posts", async () => {
    const owner = await makeEmployee(db);
    const other = await makeEmployee(db);
    const pending = await makePost(db, owner.id, "tiktok_video", {
      status: "pending",
    });
    const approved = await makePost(db, owner.id, "tiktok_video");
    expect(await failure(() => withdrawPost(db, other, pending.id))).toEqual({
      status: 404,
      code: "not_found",
    });
    expect(await failure(() => withdrawPost(db, owner, approved.id))).toEqual({
      status: 409,
      code: "invalid_transition",
    });
    await withdrawPost(db, owner, pending.id);
    expect(
      await db.query.posts.findFirst({ where: eq(posts.id, pending.id) }),
    ).toBeUndefined();
  });

  it("limits the owner to one re-check every 10 minutes; admins can always", async () => {
    const owner = await makeEmployee(db);
    const admin = await makeEmployee(db, { role: "admin" });
    const stranger = await makeEmployee(db);
    const post = await makePost(db, owner.id, "instagram_reel", {
      status: "pending",
      checkStatus: "failed",
    });
    const first = serviceContext(db, now);
    await recheckPost(first, owner, false, post.id);
    expect(
      (await db.query.posts.findFirst({ where: eq(posts.id, post.id) }))
        ?.checkStatus,
    ).toBe("running");
    await first.flush();
    expect(
      await failure(() =>
        recheckPost(
          serviceContext(db, new Date(now.getTime() + 5 * 60_000)),
          owner,
          false,
          post.id,
        ),
      ),
    ).toEqual({ status: 429, code: "rate_limited" });
    await expect(
      recheckPost(
        serviceContext(db, new Date(now.getTime() + 5 * 60_000)),
        admin,
        true,
        post.id,
      ),
    ).resolves.toBeUndefined();
    expect(
      await failure(() =>
        recheckPost(serviceContext(db, now), stranger, false, post.id),
      ),
    ).toEqual({ status: 404, code: "not_found" });
  });
});

describe("reads", () => {
  it("returns my posts newest first with both board summaries", async () => {
    const me = await makeEmployee(db);
    const rival = await makeEmployee(db);
    await makePost(db, me.id, "tiktok_video", { views: 1000, reactions: 50 });
    await makePost(db, me.id, "linkedin_post", { views: null, reactions: 40 });
    await makePost(db, me.id, "instagram_reel", {
      status: "pending",
      submittedAt: new Date("2026-10-19T10:00:00+04:00"),
    });
    await makePost(db, rival.id, "tiktok_video", {
      views: 5000,
      reactions: 10,
    });

    const response = await getMyPosts({ db, config: testConfig, now }, me);
    expect(response.posts.map((post) => post.status)[0]).toBe("pending");
    expect(response.summary).toEqual({
      postCount: 3,
      approvedCount: 2,
      pendingCount: 1,
      boards: {
        video: {
          rank: 2,
          totalParticipants: 2,
          score: 1050,
          totalViews: 1000,
          totalReactions: 50,
        },
        static: {
          rank: 1,
          totalParticipants: 1,
          score: 40,
          totalViews: null,
          totalReactions: 40,
        },
      },
    });
  });

  it("lists only the posts counted in an employee's entry", async () => {
    const employee = await makeEmployee(db);
    const counted = await makePost(db, employee.id, "tiktok_video", {
      views: 10,
      reactions: 1,
    });
    await makePost(db, employee.id, "tiktok_video", { status: "pending" });
    await makePost(db, employee.id, "tiktok_video", { status: "disqualified" });
    await makePost(db, employee.id, "linkedin_post");
    const list = await getEmployeePosts(
      { db, config: testConfig, now },
      employee.id,
      {
        category: "video",
        platform: "all",
        period: "all",
        round: null,
      },
    );
    expect(list.map((post) => post.id)).toEqual([counted.id]);
  });
});
