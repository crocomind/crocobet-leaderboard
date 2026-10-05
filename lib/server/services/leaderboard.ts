import "server-only";
import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  sql,
} from "drizzle-orm";
import type {
  BoardSummary,
  ContentCategory,
  LeaderboardPeriod,
  LeaderboardQuery,
  LeaderboardResponse,
  PlatformFilter,
} from "@/lib/api/types";
import { resolvePeriod } from "@/lib/periods";
import { CATEGORY_PLATFORMS } from "@/lib/platforms";
import { type BoardFilter, rankBoard, rankMap } from "@/lib/ranking";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import { postMetricSnapshots, posts, syncRuns } from "@/lib/server/db/schema";
import { loadEmployees } from "@/lib/server/services/employees";
import { toRankable } from "@/lib/server/services/mappers";

const DAY_MS = 86_400_000;

/** A platform that isn't on the board (e.g. LinkedIn on Video) means all platforms. */
export function boardPlatform(
  category: ContentCategory,
  platform: PlatformFilter,
): PlatformFilter {
  return platform === "all" || CATEGORY_PLATFORMS[category].includes(platform)
    ? platform
    : "all";
}

function boardConditions(filter: BoardFilter) {
  return and(
    eq(posts.status, "approved"),
    eq(posts.category, filter.category),
    gte(posts.publishedAt, filter.range.start),
    lt(posts.publishedAt, filter.range.end),
    filter.platform === "all" ? undefined : eq(posts.platform, filter.platform),
  );
}

/** The posts counted on a board: approved, in the category and platform, published in the period. */
export async function countedRows(db: Db, filter: BoardFilter) {
  return db.select().from(posts).where(boardConditions(filter));
}

/**
 * The same board 24 hours earlier: posts approved by then, each with its
 * latest snapshot at or before then (lib/ranking.ts postsAsOf, in SQL).
 */
async function rowsAsOf(db: Db, filter: BoardFilter, asOf: Date) {
  const latest = db
    .select({
      views: postMetricSnapshots.views,
      reactions: postMetricSnapshots.reactions,
    })
    .from(postMetricSnapshots)
    .where(
      and(
        eq(postMetricSnapshots.postId, posts.id),
        lte(postMetricSnapshots.fetchedAt, asOf),
      ),
    )
    .orderBy(desc(postMetricSnapshots.fetchedAt))
    .limit(1)
    .as("latest");
  const rows = await db
    .select({ post: posts, views: latest.views, reactions: latest.reactions })
    .from(posts)
    .leftJoinLateral(latest, sql`true`)
    .where(and(boardConditions(filter), lte(posts.approvedAt, asOf)));
  return rows.map(({ post, views, reactions }) => ({
    ...toRankable(post),
    views,
    reactions: reactions ?? 0,
  }));
}

export async function lastSyncedAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(syncRuns.finishedAt) })
    .from(syncRuns)
    .where(and(isNotNull(syncRuns.finishedAt), isNull(syncRuns.error)));
  return row?.at ?? null;
}

export function boardFilter(
  config: ServerConfig,
  category: ContentCategory,
  platform: PlatformFilter,
  period: LeaderboardPeriod,
  now: Date,
): BoardFilter & { platform: PlatformFilter } {
  const range = resolvePeriod(period, now, config.campaign);
  return {
    category,
    platform: boardPlatform(category, platform),
    range: { start: range.start, end: range.end },
  };
}

export async function getLeaderboard(
  db: Db,
  config: ServerConfig,
  query: LeaderboardQuery,
  meId: string,
  now: Date,
): Promise<LeaderboardResponse> {
  const range = resolvePeriod(query.period, now, config.campaign);
  const filter = boardFilter(
    config,
    query.category,
    query.platform,
    query.period,
    now,
  );
  const [current, yesterday, syncedAt] = await Promise.all([
    countedRows(db, filter),
    rowsAsOf(db, filter, new Date(now.getTime() - DAY_MS)),
    lastSyncedAt(db),
  ]);
  const employees = await loadEmployees(db, [
    ...current.map((row) => row.employeeId),
    ...yesterday.map((row) => row.employeeId),
  ]);
  const before = rankBoard(yesterday, employees, filter);
  const board = rankBoard(current.map(toRankable), employees, filter, {
    search: query.search,
    meId,
    previousRanks: rankMap(before),
  });

  return {
    query: { ...query, platform: filter.platform },
    period: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      isCurrent: range.isCurrent,
      timeZone: config.campaign.timeZone,
    },
    entries: board.entries,
    totalParticipants: board.totalParticipants,
    myStanding: board.myStanding,
    lastSyncedAt: syncedAt?.toISOString() ?? null,
  };
}

/** The employee's rank and totals on one board, for the whole challenge. */
export async function boardSummary(
  db: Db,
  config: ServerConfig,
  category: ContentCategory,
  meId: string,
  now: Date,
): Promise<BoardSummary> {
  const filter = boardFilter(config, category, "all", "all", now);
  const rows = await countedRows(db, filter);
  const employees = await loadEmployees(
    db,
    rows.map((row) => row.employeeId),
  );
  const board = rankBoard(rows.map(toRankable), employees, filter, { meId });
  const entry = board.myStanding?.entry;
  return {
    rank: entry?.rank ?? null,
    totalParticipants: board.totalParticipants,
    score: entry?.score ?? 0,
    totalViews: category === "video" ? (entry?.totalViews ?? 0) : null,
    totalReactions: entry?.totalReactions ?? 0,
  };
}
