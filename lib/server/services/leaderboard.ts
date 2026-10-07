import "server-only";
import {
  and,
  asc,
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
  RoundRef,
} from "@/lib/api/types";
import {
  type BoardRange,
  frozenAt,
  resolveBoardRange,
  roundNumbers,
} from "@/lib/rounds";
import { CATEGORY_PLATFORMS } from "@/lib/platforms";
import {
  type BoardFilter,
  type RankablePost,
  rankBoard,
  rankMap,
} from "@/lib/ranking";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import { postMetricSnapshots, posts, syncRuns } from "@/lib/server/db/schema";
import { loadEmployees } from "@/lib/server/services/employees";
import { loadExcluded } from "@/lib/server/services/exclusions";
import { loadRounds } from "@/lib/server/services/rounds";
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
export async function rowsAsOf(db: Db, filter: BoardFilter, asOf: Date) {
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
    // While locked, the admin's (manual) numbers win over later provider snapshots.
    .orderBy(
      sql`case when ${posts.metricsLocked} and ${postMetricSnapshots.source} = 'manual' then 0 else 1 end`,
      desc(postMetricSnapshots.fetchedAt),
    )
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

/**
 * Approved posts published in `range` (every category and platform), their
 * numbers frozen at `end`: the snapshot that held then, else the first one
 * after (the manual one first while locked), else the post's own numbers.
 * lib/ranking.ts postsFrozenAt, in SQL.
 */
export async function frozenPosts(
  db: Db,
  range: { start: Date; end: Date },
  end: Date,
): Promise<RankablePost[]> {
  const at = sql`${end.toISOString()}::timestamptz`;
  const near = db
    .select({
      fetchedAt: postMetricSnapshots.fetchedAt,
      views: postMetricSnapshots.views,
      reactions: postMetricSnapshots.reactions,
    })
    .from(postMetricSnapshots)
    .where(eq(postMetricSnapshots.postId, posts.id))
    .orderBy(
      sql`case when ${postMetricSnapshots.fetchedAt} <= ${at} then 0 else 1 end`,
      sql`case when ${posts.metricsLocked} and ${postMetricSnapshots.source} = 'manual' then 0 else 1 end`,
      sql`case when ${postMetricSnapshots.fetchedAt} <= ${at} then ${postMetricSnapshots.fetchedAt} end desc nulls last`,
      asc(postMetricSnapshots.fetchedAt),
    )
    .limit(1)
    .as("near");
  const rows = await db
    .select({
      post: posts,
      fetchedAt: near.fetchedAt,
      views: near.views,
      reactions: near.reactions,
    })
    .from(posts)
    .leftJoinLateral(near, sql`true`)
    .where(
      and(
        eq(posts.status, "approved"),
        gte(posts.publishedAt, range.start),
        lt(posts.publishedAt, range.end),
      ),
    );
  return rows.map(({ post, fetchedAt, views, reactions }) => {
    const rankable = toRankable(post);
    return fetchedAt
      ? { ...rankable, views, reactions: reactions ?? 0 }
      : rankable;
  });
}

export async function lastSyncedAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(syncRuns.finishedAt) })
    .from(syncRuns)
    .where(and(isNotNull(syncRuns.finishedAt), isNull(syncRuns.error)));
  return row?.at ?? null;
}

export interface ResolvedBoard {
  filter: BoardFilter & { platform: PlatformFilter };
  range: BoardRange;
  /** The round shown, with its number, or null. */
  round: RoundRef | null;
}

/**
 * Which posts a board counts: the category, the platform (only one that's
 * on the board), the dates (a started round chosen by id, the running round,
 * or the whole challenge; always inside the challenge) and who an admin took
 * off that leaderboard.
 */
export async function resolveBoard(
  db: Db,
  config: ServerConfig,
  query: {
    category: ContentCategory;
    platform: PlatformFilter;
    period: LeaderboardPeriod;
    round: string | null;
  },
  reference: Date,
  now: Date = reference,
): Promise<ResolvedBoard> {
  const rounds =
    query.period === "all" ? [] : await loadRounds(db, query.period);
  const range = resolveBoardRange(query.period, {
    roundId: query.round,
    reference,
    now,
    campaign: config.campaign,
    rounds,
  });
  const number = range.round
    ? roundNumbers(rounds).get(range.round.id)
    : undefined;
  const excluded = await loadExcluded(db, range.round?.id ?? null);
  return {
    filter: {
      category: query.category,
      platform: boardPlatform(query.category, query.platform),
      range: { start: range.start, end: range.end },
      excluded,
    },
    range,
    round: range.round
      ? {
          id: range.round.id,
          kind: range.round.kind,
          name: range.round.name,
          number: number ?? 1,
        }
      : null,
  };
}

export async function getLeaderboard(
  db: Db,
  config: ServerConfig,
  query: LeaderboardQuery,
  meId: string,
  now: Date,
): Promise<LeaderboardResponse> {
  const { filter, range, round } = await resolveBoard(db, config, query, now);
  // A finished round's results are frozen at its end, so its ranks don't
  // move any more either (yesterday is the same board).
  const end = frozenAt(range, now);
  const [current, yesterday, syncedAt] = await Promise.all([
    end
      ? frozenPosts(db, filter.range, end)
      : countedRows(db, filter).then((rows) => rows.map(toRankable)),
    end ? null : rowsAsOf(db, filter, new Date(now.getTime() - DAY_MS)),
    lastSyncedAt(db),
  ]);
  const employees = await loadEmployees(db, [
    ...current.map((row) => row.employeeId),
    ...(yesterday ?? []).map((row) => row.employeeId),
  ]);
  const before = rankBoard(yesterday ?? current, employees, filter);
  const board = rankBoard(current, employees, filter, {
    search: query.search,
    meId,
    previousRanks: rankMap(before),
  });

  return {
    query: {
      ...query,
      platform: filter.platform,
      // What's actually shown: the challenge when no round of the asked kind
      // applies, and the round only if it's the one asked for.
      period: range.period,
      round: query.round && round?.id === query.round ? query.round : null,
    },
    period: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      isCurrent: range.isCurrent,
      timeZone: config.campaign.timeZone,
      round,
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
  const { filter } = await resolveBoard(
    db,
    config,
    { category, platform: "all", period: "all", round: null },
    now,
  );
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
