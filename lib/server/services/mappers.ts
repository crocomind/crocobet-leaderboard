import "server-only";
import type { Post } from "@/lib/api/types";
import type { PostRow } from "@/lib/server/db/schema";
import type { RankablePost } from "@/lib/ranking";
import { displayedViews, postScore } from "@/lib/scoring";

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** A post as the API returns it (contract v1). */
/** `metrics` replaces the post's own numbers (a finished round's frozen ones). */
export function toPost(
  row: PostRow,
  metrics?: { views: number | null; reactions: number },
): Post {
  const details = row.checkDetails;
  const { views, reactions } = metrics ?? row;
  return {
    id: row.id,
    employeeId: row.employeeId,
    url: row.urlCanonical,
    platform: row.platform,
    contentType: row.contentType,
    category: row.category,
    title: row.title,
    publishedAt: iso(row.publishedAt),
    submittedAt: row.submittedAt.toISOString(),
    status: row.status,
    statusReason: row.statusReason,
    statusNote: row.statusNote,
    check: {
      status: row.checkStatus,
      tagFound: details?.tagFound ?? null,
      matched: details?.matched ?? [],
      authorHandle: details?.authorHandle ?? null,
      ownerMatch: details?.ownerMatch ?? null,
      publishedInWindow: details?.publishedInWindow ?? null,
      error: details?.error ?? null,
      checkedAt: iso(row.checkedAt),
    },
    views: displayedViews(row.category, views),
    reactions,
    score: postScore(row.category, views, reactions),
    metricsUpdatedAt: iso(row.metricsFetchedAt),
    thumbnailUrl: row.thumbnailUrl,
  };
}

export function toRankable(row: PostRow): RankablePost {
  return {
    id: row.id,
    employeeId: row.employeeId,
    url: row.urlCanonical,
    platform: row.platform,
    contentType: row.contentType,
    category: row.category,
    status: row.status,
    publishedAt: row.publishedAt,
    views: row.views,
    reactions: row.reactions,
  };
}
