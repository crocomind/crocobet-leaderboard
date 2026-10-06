import { describe, expect, it } from "vitest";
import { fixtureFetch } from "@/lib/fixture-post";
import type { FetchedPost } from "@/lib/post-data";
import {
  type EvaluatedPost,
  type EvaluationContext,
  evaluateFetch,
  isProviderFailure,
} from "@/lib/post-check";

const now = new Date("2026-10-20T08:00:00+04:00");
const context: EvaluationContext = {
  now,
  campaign: {
    startsAt: new Date("2026-10-06T00:00:00+04:00"),
    endsAt: new Date("2027-01-06T00:00:00+04:00"),
    timeZone: "Asia/Tbilisi",
  },
  tags: { hashtags: ["CrocoBySquad"], mentions: { instagram: ["crocosquad"] } },
  employeeId: "ana",
  linkedHandles: [],
  growthFlag: { factor: 5, min: 1000 },
};

const basePost: EvaluatedPost = {
  platform: "instagram",
  contentType: "instagram_reel",
  externalId: "C1",
  status: "pending",
  title: null,
  publishedAt: null,
  publishedAtSource: null,
  submittedPostedAt: null,
  views: null,
  reactions: 0,
  metricsLocked: false,
  flags: [],
  consecutiveFetchFailures: 0,
  lastSnapshot: null,
};

function fetched(overrides: Partial<FetchedPost> = {}) {
  return {
    ok: true as const,
    post: {
      canonicalUrl: null,
      externalId: "C1",
      mediaKind: "video" as const,
      caption: "Office tour #CrocoBySquad @crocosquad",
      hashtags: [],
      mentions: [],
      authorHandle: "ana.g",
      authorName: "Ana",
      publishedAt: new Date("2026-10-10T12:00:00+04:00"),
      views: 1500,
      reactions: 120,
      thumbnailUrl: null,
      raw: {},
      ...overrides,
    },
  };
}

describe("evaluateFetch", () => {
  it("passes the check when the tag is found and records the evidence", () => {
    const result = evaluateFetch(basePost, fetched(), context);
    expect(result.check).toMatchObject({
      status: "passed",
      tagFound: true,
      matched: ["#crocobysquad", "@crocosquad"],
      authorHandle: "ana.g",
      ownerMatch: null,
      publishedInWindow: true,
      error: null,
    });
    expect(result).toMatchObject({
      views: 1500,
      reactions: 120,
      publishedAtSource: "provider",
      title: "Office tour #CrocoBySquad @crocosquad",
      flags: [],
    });
  });

  it("fails the check without the tag but keeps the metrics", () => {
    const result = evaluateFetch(
      basePost,
      fetched({ caption: "Office tour" }),
      context,
    );
    expect(result.check.status).toBe("failed");
    expect(result.check.tagFound).toBe(false);
    expect(result.views).toBe(1500);
    // Either one is enough: the hashtag alone, or the tag alone.
    for (const caption of ["Office tour #CrocoBySquad", "With @crocosquad"])
      expect(
        evaluateFetch(basePost, fetched({ caption }), context).check.status,
      ).toBe("passed");
  });

  it("flags tag_removed only on approved posts", () => {
    const untagged = fetched({ caption: "no tag" });
    expect(evaluateFetch(basePost, untagged, context).flags).not.toContain(
      "tag_removed",
    );
    expect(
      evaluateFetch({ ...basePost, status: "approved" }, untagged, context)
        .flags,
    ).toContain("tag_removed");
    expect(
      evaluateFetch(
        { ...basePost, status: "approved", flags: ["tag_removed"] },
        fetched(),
        context,
      ).flags,
    ).not.toContain("tag_removed");
  });

  it("moves a photo link that's really a video to the video board", () => {
    const result = evaluateFetch(
      { ...basePost, contentType: "instagram_photo" },
      fetched({ mediaKind: "video" }),
      context,
    );
    expect(result).toMatchObject({
      contentType: "instagram_reel",
      category: "video",
      reclassified: true,
    });
    expect(result.flags).toContain("category_reclassified");
  });

  it("never reclassifies LinkedIn and ignores views on static content", () => {
    const result = evaluateFetch(
      { ...basePost, platform: "linkedin", contentType: "linkedin_post" },
      fetched({ mediaKind: "video", views: 9000 }),
      context,
    );
    expect(result.contentType).toBe("linkedin_post");
    expect(result.views).toBeNull();
    expect(result.snapshot).toEqual({ views: null, reactions: 120 });
  });

  it("falls back from provider to post ID to the submitter's date", () => {
    // TikTok ID for 2026-10-12 10:00 UTC.
    const id = (
      (BigInt(Date.UTC(2026, 9, 12, 10) / 1000) << 32n) |
      123n
    ).toString();
    const tiktok: EvaluatedPost = {
      ...basePost,
      platform: "tiktok",
      contentType: "tiktok_video",
      externalId: id,
      submittedPostedAt: "2026-10-11",
    };
    expect(
      evaluateFetch(tiktok, fetched({ publishedAt: null }), context),
    ).toMatchObject({
      publishedAt: new Date(Date.UTC(2026, 9, 12, 10)),
      publishedAtSource: "post_id",
    });

    const reel = { ...basePost, submittedPostedAt: "2026-10-11" };
    const fromSubmitter = evaluateFetch(
      reel,
      fetched({ publishedAt: null }),
      context,
    );
    expect(fromSubmitter).toMatchObject({
      publishedAt: new Date("2026-10-11T12:00:00+04:00"),
      publishedAtSource: "submitter",
    });
    expect(fromSubmitter.flags).toContain("published_date_uncertain");
  });

  it("keeps an admin-set publish date", () => {
    const adminDate = new Date("2026-10-15T09:00:00Z");
    const result = evaluateFetch(
      { ...basePost, publishedAt: adminDate, publishedAtSource: "admin" },
      fetched(),
      context,
    );
    expect(result.publishedAt).toEqual(adminDate);
    expect(result.publishedAtSource).toBe("admin");
  });

  it("marks posts published outside the challenge", () => {
    const result = evaluateFetch(
      basePost,
      fetched({ publishedAt: new Date("2026-09-30T12:00:00+04:00") }),
      context,
    );
    expect(result.check.publishedInWindow).toBe(false);
  });

  it("doesn't flag account ownership, and clears old ownership flags", () => {
    // Admins judge whose post it is when they approve.
    const linked = [
      { handle: "ana.g", employeeId: "nino" },
      { handle: "ana.real", employeeId: "ana" },
    ];
    for (const authorHandle of ["ana.g", "someone.else"]) {
      const result = evaluateFetch(
        { ...basePost, flags: ["author_mismatch", "handle_claimed_by_other"] },
        fetched({ authorHandle }),
        { ...context, linkedHandles: linked },
      );
      expect(result.flags).not.toContain("author_mismatch");
      expect(result.flags).not.toContain("handle_claimed_by_other");
    }
  });

  it("keeps the last values on a failed fetch and flags unavailable after 3", () => {
    const post = {
      ...basePost,
      views: 800,
      reactions: 40,
      consecutiveFetchFailures: 2,
    };
    const failed = evaluateFetch(
      post,
      { ok: false, error: "private", retryable: false },
      context,
    );
    expect(failed).toMatchObject({
      views: 800,
      reactions: 40,
      snapshot: null,
      consecutiveFetchFailures: 3,
    });
    expect(failed.check).toMatchObject({ status: "error", error: "private" });
    expect(failed.flags).toContain("unavailable");

    const recovered = evaluateFetch(
      { ...post, flags: failed.flags, consecutiveFetchFailures: 3 },
      fetched(),
      context,
    );
    expect(recovered.flags).not.toContain("unavailable");
    expect(recovered.consecutiveFetchFailures).toBe(0);
  });

  it("doesn't count the provider's own failures against the post", () => {
    const post = {
      ...basePost,
      views: 800,
      reactions: 40,
      consecutiveFetchFailures: 2,
    };
    for (const error of ["provider_error", "rate_limited"] as const) {
      const outcome = { ok: false as const, error, retryable: true };
      expect(isProviderFailure(outcome)).toBe(true);
      const result = evaluateFetch(post, outcome, context);
      expect(result.consecutiveFetchFailures).toBe(2);
      expect(result.flags).not.toContain("unavailable");
    }
    expect(
      isProviderFailure({ ok: false, error: "not_found", retryable: false }),
    ).toBe(false);
  });

  it("keeps locked metrics as entered but still reports the snapshot", () => {
    const result = evaluateFetch(
      { ...basePost, views: 5000, reactions: 300, metricsLocked: true },
      fetched(),
      context,
    );
    expect(result).toMatchObject({ views: 5000, reactions: 300 });
    expect(result.snapshot).toEqual({ views: 1500, reactions: 120 });
  });

  it("flags hidden views and suspicious growth between snapshots", () => {
    const hidden = evaluateFetch(basePost, fetched({ views: null }), context);
    expect(hidden.flags).toContain("metrics_unavailable");
    expect(hidden.views).toBeNull();

    const first = evaluateFetch(basePost, fetched({ views: 50_000 }), context);
    expect(first.flags).not.toContain("suspicious_growth");

    const jump = evaluateFetch(
      { ...basePost, lastSnapshot: { views: 1500, reactions: 120 } },
      fetched({ views: 50_000 }),
      context,
    );
    expect(jump.flags).toContain("suspicious_growth");

    const steady = evaluateFetch(
      { ...basePost, lastSnapshot: { views: 1500, reactions: 120 } },
      fetched({ views: 6000 }),
      context,
    );
    expect(steady.flags).not.toContain("suspicious_growth");
  });
});

describe("fixtureFetch", () => {
  const ref = {
    platform: "instagram" as const,
    contentType: "instagram_reel" as const,
    url: "https://instagram.com/reel/ABC123",
    externalId: "ABC123",
  };

  it("is deterministic for a URL", () => {
    const submittedAt = new Date("2026-10-15T10:00:00Z");
    expect(fixtureFetch(ref, { now, submittedAt })).toEqual(
      fixtureFetch(ref, { now, submittedAt }),
    );
  });

  it("grows metrics with time and keeps the publish date stable", () => {
    const submittedAt = new Date("2026-10-15T10:00:00Z");
    // Find a reachable fixture post with metrics.
    for (let i = 0; i < 40; i++) {
      const candidate = { ...ref, url: `${ref.url}${i}` };
      const early = fixtureFetch(candidate, {
        now: new Date("2026-10-16T00:00:00Z"),
        submittedAt,
      });
      const later = fixtureFetch(candidate, {
        now: new Date("2026-10-25T00:00:00Z"),
        submittedAt,
      });
      if (!early.ok || !later.ok || early.post.views === null) continue;
      expect(later.post.views!).toBeGreaterThan(early.post.views);
      expect(later.post.reactions!).toBeGreaterThanOrEqual(
        early.post.reactions!,
      );
      expect(later.post.publishedAt).toEqual(early.post.publishedAt);
      return;
    }
    throw new Error("No reachable fixture post found");
  });

  it("returns some unreachable posts", () => {
    const outcomes = Array.from({ length: 200 }, (_, i) =>
      fixtureFetch({ ...ref, url: `${ref.url}-${i}` }, { now }),
    );
    expect(outcomes.some((outcome) => !outcome.ok)).toBe(true);
    expect(outcomes.filter((outcome) => outcome.ok).length).toBeGreaterThan(
      150,
    );
  });
});
