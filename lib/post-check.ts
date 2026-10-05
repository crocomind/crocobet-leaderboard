import type { PostCheck, PostFlag, PublishedAtSource } from "@/lib/api/types";
import { type CampaignTagConfig, checkCampaignTag } from "@/lib/campaign-tag";
import type { PostStatus } from "@/lib/ranking";
import {
  type CampaignWindow,
  isWithin,
  postedDateToInstant,
} from "@/lib/periods";
import {
  type ContentCategory,
  type ContentType,
  type Platform,
  VIDEO_RECLASSIFICATION,
  categoryOf,
} from "@/lib/platforms";
import { publishedAtFromExternalId } from "@/lib/post-ids";
import type { FetchOutcome } from "@/lib/post-data";

/**
 * Turns one provider fetch into the post's new check, flags, content type,
 * publish date and metrics. Pure, so the sync job and the mock API apply
 * exactly the same rules (§4.3–§4.7 of the implementation brief).
 */

export const FAILURES_BEFORE_UNAVAILABLE = 3;
export const TITLE_FROM_CAPTION_MAX = 120;

export interface EvaluatedPost {
  platform: Platform;
  contentType: ContentType;
  externalId: string | null;
  status: PostStatus;
  title: string | null;
  publishedAt: Date | null;
  publishedAtSource: PublishedAtSource | null;
  /** The submitter's "posted on" date, YYYY-MM-DD. */
  submittedPostedAt: string | null;
  views: number | null;
  reactions: number;
  metricsLocked: boolean;
  flags: readonly PostFlag[];
  consecutiveFetchFailures: number;
  /** The previous provider snapshot (growth is measured between consecutive snapshots). */
  lastSnapshot: { views: number | null; reactions: number | null } | null;
}

export interface EvaluationContext {
  now: Date;
  campaign: CampaignWindow;
  tags: CampaignTagConfig;
  employeeId: string;
  /** Every linked handle on the post's platform, for the ownership flags. */
  linkedHandles: readonly { handle: string; employeeId: string }[];
  growthFlag: { factor: number; min: number };
}

export interface Evaluation {
  check: PostCheck;
  contentType: ContentType;
  category: ContentCategory;
  reclassified: boolean;
  title: string | null;
  caption: string | null;
  authorHandle: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  publishedAtSource: PublishedAtSource | null;
  /** The post's values after this fetch (unchanged while metrics are locked). */
  views: number | null;
  reactions: number;
  /** What the provider reported, for the snapshot. null when the fetch failed. */
  snapshot: { views: number | null; reactions: number | null } | null;
  flags: PostFlag[];
  consecutiveFetchFailures: number;
}

function setFlag(flags: Set<PostFlag>, flag: PostFlag, on: boolean) {
  if (on) flags.add(flag);
  else flags.delete(flag);
}

function grewSuspiciously(
  before: number | null,
  after: number | null,
  { factor, min }: EvaluationContext["growthFlag"],
): boolean {
  if (before === null || after === null) return false;
  const growth = after - before;
  return growth > min && after > before * factor;
}

function resolvePublishedAt(
  post: EvaluatedPost,
  provided: Date | null,
  now: Date,
  timeZone: string,
): { publishedAt: Date | null; source: PublishedAtSource | null } {
  if (post.publishedAtSource === "admin")
    return { publishedAt: post.publishedAt, source: "admin" };
  if (provided) return { publishedAt: provided, source: "provider" };
  const fromId = publishedAtFromExternalId(
    post.contentType,
    post.externalId,
    now,
  );
  if (fromId) return { publishedAt: fromId, source: "post_id" };
  const fromSubmitter = post.submittedPostedAt
    ? postedDateToInstant(post.submittedPostedAt, timeZone)
    : null;
  if (fromSubmitter) return { publishedAt: fromSubmitter, source: "submitter" };
  return { publishedAt: null, source: null };
}

export function evaluateFetch(
  post: EvaluatedPost,
  outcome: FetchOutcome,
  context: EvaluationContext,
): Evaluation {
  const { now, campaign } = context;
  const flags = new Set(post.flags);
  const checkedAt = now.toISOString();

  if (!outcome.ok) {
    const failures = post.consecutiveFetchFailures + 1;
    setFlag(flags, "unavailable", failures >= FAILURES_BEFORE_UNAVAILABLE);
    const published = resolvePublishedAt(post, null, now, campaign.timeZone);
    setFlag(
      flags,
      "published_date_uncertain",
      published.source === "submitter",
    );
    return {
      check: {
        status: "error",
        tagFound: null,
        matched: [],
        authorHandle: null,
        ownerMatch: null,
        publishedInWindow: published.publishedAt
          ? isWithin(published.publishedAt, {
              start: campaign.startsAt,
              end: campaign.endsAt,
            })
          : null,
        error: outcome.error,
        checkedAt,
      },
      contentType: post.contentType,
      category: categoryOf(post.contentType),
      reclassified: false,
      title: post.title,
      caption: null,
      authorHandle: null,
      authorName: null,
      thumbnailUrl: null,
      publishedAt: published.publishedAt,
      publishedAtSource: published.source,
      views: post.views,
      reactions: post.reactions,
      snapshot: null,
      flags: [...flags],
      consecutiveFetchFailures: failures,
    };
  }

  const fetched = outcome.post;
  setFlag(flags, "unavailable", false);

  // Reclassification: a "photo" link that's really a video moves to the video board.
  const videoType = VIDEO_RECLASSIFICATION[post.contentType];
  const reclassified = Boolean(videoType) && fetched.mediaKind === "video";
  const contentType = reclassified && videoType ? videoType : post.contentType;
  const category = categoryOf(contentType);
  if (reclassified) flags.add("category_reclassified");

  const published = resolvePublishedAt(
    post,
    fetched.publishedAt,
    now,
    campaign.timeZone,
  );
  setFlag(flags, "published_date_uncertain", published.source === "submitter");

  const tag = checkCampaignTag(
    post.platform,
    {
      caption: fetched.caption,
      hashtags: fetched.hashtags,
      mentions: fetched.mentions,
    },
    context.tags,
  );
  setFlag(flags, "tag_removed", post.status === "approved" && !tag.passed);

  const handle = fetched.authorHandle?.replace(/^@/, "").toLowerCase() ?? null;
  const mine = context.linkedHandles.filter(
    (linked) => linked.employeeId === context.employeeId,
  );
  const claimedByOther =
    handle !== null &&
    context.linkedHandles.some(
      (linked) =>
        linked.handle === handle && linked.employeeId !== context.employeeId,
    );
  const ownerMatch =
    handle === null
      ? null
      : claimedByOther
        ? false
        : mine.some((linked) => linked.handle === handle)
          ? true
          : mine.length > 0
            ? false
            : null;
  setFlag(flags, "handle_claimed_by_other", claimedByOther);
  setFlag(flags, "author_mismatch", !claimedByOther && ownerMatch === false);

  // Static content never counts views, whatever the provider reports.
  const reportedViews = category === "video" ? fetched.views : null;
  const reportedReactions = fetched.reactions;
  setFlag(
    flags,
    "metrics_unavailable",
    (category === "video" && reportedViews === null) ||
      reportedReactions === null,
  );
  const last = post.lastSnapshot;
  if (
    last &&
    (grewSuspiciously(last.views, reportedViews, context.growthFlag) ||
      grewSuspiciously(last.reactions, reportedReactions, context.growthFlag))
  )
    flags.add("suspicious_growth");

  const views = post.metricsLocked
    ? category === "video"
      ? post.views
      : null
    : (reportedViews ?? (category === "video" ? post.views : null));
  const reactions = post.metricsLocked
    ? post.reactions
    : (reportedReactions ?? post.reactions);

  const firstLine = fetched.caption?.split("\n")[0]?.trim() ?? "";
  const title =
    post.title ??
    (firstLine ? firstLine.slice(0, TITLE_FROM_CAPTION_MAX) : null);

  return {
    check: {
      status: tag.passed ? "passed" : "failed",
      tagFound: tag.passed,
      matched: tag.matched,
      authorHandle: handle,
      ownerMatch,
      publishedInWindow: published.publishedAt
        ? isWithin(published.publishedAt, {
            start: campaign.startsAt,
            end: campaign.endsAt,
          })
        : null,
      error: null,
      checkedAt,
    },
    contentType,
    category,
    reclassified,
    title,
    caption: fetched.caption,
    authorHandle: handle,
    authorName: fetched.authorName,
    thumbnailUrl: fetched.thumbnailUrl,
    publishedAt: published.publishedAt,
    publishedAtSource: published.source,
    views,
    reactions,
    snapshot: { views: reportedViews, reactions: reportedReactions },
    flags: [...flags],
    consecutiveFetchFailures: 0,
  };
}
