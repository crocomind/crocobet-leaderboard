import {
  type ContentCategory,
  type ContentType,
  type Platform,
  PLATFORM_IDS,
} from "@/lib/platforms";
import { isWithin } from "@/lib/periods";
import { postScore } from "@/lib/scoring";
import { normalizeForSearch } from "@/lib/utils";

/**
 * Leaderboard ranking, shared by the mock API and the server so both always
 * agree. One entry per employee; the score is the sum of their approved
 * posts' scores on the board.
 */

export type PostStatus = "pending" | "approved" | "rejected" | "disqualified";

export interface RankablePost {
  id: string;
  employeeId: string;
  url: string;
  platform: Platform;
  contentType: ContentType;
  category: ContentCategory;
  status: PostStatus;
  publishedAt: Date | null;
  views: number | null;
  reactions: number;
}

export interface RankableEmployee {
  id: string;
  name: string;
}

export interface BoardFilter {
  category: ContentCategory;
  platform: Platform | "all";
  range: { start: Date; end: Date };
}

export interface TopPost {
  id: string;
  url: string;
  platform: Platform;
  contentType: ContentType;
  views: number | null;
  reactions: number;
  score: number;
}

export interface RankedEntry<E extends RankableEmployee> {
  rank: number;
  previousRank: number | null;
  employee: E;
  postCount: number;
  /** null on the static board. */
  totalViews: number | null;
  totalReactions: number;
  score: number;
  platforms: Platform[];
  topPost: TopPost;
}

export interface RankedBoard<E extends RankableEmployee> {
  /** Sorted by rank, after the search filter (ranks aren't renumbered). */
  entries: RankedEntry<E>[];
  /** Ranked employees before the search filter. */
  totalParticipants: number;
  myStanding: { entry: RankedEntry<E>; gapToNext: number | null } | null;
}

/** Only approved posts in the category and platform, published inside the period, count. */
export function countsOnBoard(
  post: RankablePost,
  filter: BoardFilter,
): boolean {
  return (
    post.status === "approved" &&
    post.category === filter.category &&
    (filter.platform === "all" || post.platform === filter.platform) &&
    isWithin(post.publishedAt, filter.range)
  );
}

const scoreOf = (post: RankablePost) =>
  postScore(post.category, post.views, post.reactions);

/** Highest score first; ties go to the most recently published. */
function byScoreThenRecent(a: RankablePost, b: RankablePost): number {
  return (
    scoreOf(b) - scoreOf(a) ||
    (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
  );
}

/** The posts counted in one employee's entry, highest score first (for the side sheet). */
export function countedPosts<P extends RankablePost>(
  posts: readonly P[],
  employeeId: string,
  filter: BoardFilter,
): P[] {
  return posts
    .filter(
      (post) => post.employeeId === employeeId && countsOnBoard(post, filter),
    )
    .sort(byScoreThenRecent);
}

export function rankBoard<E extends RankableEmployee>(
  posts: readonly RankablePost[],
  employees: ReadonlyMap<string, E>,
  filter: BoardFilter,
  options: {
    search?: string;
    meId?: string | null;
    /** Ranks on the same board 24 hours ago (from rankMap on that board). */
    previousRanks?: ReadonlyMap<string, number>;
  } = {},
): RankedBoard<E> {
  const byEmployee = new Map<string, RankablePost[]>();
  for (const post of posts) {
    if (!countsOnBoard(post, filter) || !employees.has(post.employeeId))
      continue;
    const list = byEmployee.get(post.employeeId) ?? [];
    list.push(post);
    byEmployee.set(post.employeeId, list);
  }

  const video = filter.category === "video";
  const unranked = [...byEmployee].map(([employeeId, list]) => {
    const sorted = [...list].sort(byScoreThenRecent);
    const top = sorted[0]!;
    const used = new Set(list.map((post) => post.platform));
    return {
      employee: employees.get(employeeId)!,
      postCount: list.length,
      totalViews: video
        ? list.reduce((sum, post) => sum + (post.views ?? 0), 0)
        : null,
      totalReactions: list.reduce(
        (sum, post) => sum + Math.max(0, post.reactions),
        0,
      ),
      score: list.reduce((sum, post) => sum + scoreOf(post), 0),
      platforms: PLATFORM_IDS.filter((platform) => used.has(platform)),
      topPost: {
        id: top.id,
        url: top.url,
        platform: top.platform,
        contentType: top.contentType,
        views: video ? top.views : null,
        reactions: top.reactions,
        score: scoreOf(top),
      },
    };
  });

  unranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.totalReactions - a.totalReactions ||
      a.employee.name.localeCompare(b.employee.name),
  );

  const ranked: RankedEntry<E>[] = unranked.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    previousRank: options.previousRanks?.get(entry.employee.id) ?? null,
  }));

  const myIndex = options.meId
    ? ranked.findIndex((entry) => entry.employee.id === options.meId)
    : -1;
  const mine = ranked[myIndex];
  const above = ranked[myIndex - 1];

  const search = normalizeForSearch(options.search ?? "");
  return {
    entries: search
      ? ranked.filter((entry) =>
          normalizeForSearch(entry.employee.name).includes(search),
        )
      : ranked,
    totalParticipants: ranked.length,
    myStanding: mine
      ? { entry: mine, gapToNext: above ? above.score - mine.score : null }
      : null,
  };
}

export interface PostHistory {
  /** When the post was (last) approved. */
  approvedAt: Date | null;
  /** Locked numbers were entered by an admin; later provider snapshots don't replace them. */
  metricsLocked?: boolean;
  snapshots: readonly {
    fetchedAt: Date;
    views: number | null;
    reactions: number | null;
    source?: "provider" | "manual";
  }[];
}

type Snapshot = PostHistory["snapshots"][number];

/** The snapshot that held at `asOf`: the latest one, or the latest manual one while locked. */
export function snapshotAt(
  post: PostHistory,
  asOf: Date,
): Snapshot | undefined {
  let latest: Snapshot | undefined;
  let latestManual: Snapshot | undefined;
  for (const snapshot of post.snapshots) {
    if (snapshot.fetchedAt > asOf) continue;
    if (!latest || snapshot.fetchedAt > latest.fetchedAt) latest = snapshot;
    if (
      snapshot.source === "manual" &&
      (!latestManual || snapshot.fetchedAt > latestManual.fetchedAt)
    )
      latestManual = snapshot;
  }
  return (post.metricsLocked ? latestManual : undefined) ?? latest;
}

/**
 * The posts as they stood at `asOf` (24 hours ago for previousRank, or a
 * chosen time for exports): posts approved by then, each with the snapshot
 * that held then. A post disqualified since then no longer counts; the
 * history of earlier statuses isn't replayed.
 */
export function postsAsOf<P extends RankablePost & PostHistory>(
  posts: readonly P[],
  asOf: Date,
): P[] {
  return posts.flatMap((post) => {
    if (
      post.status !== "approved" ||
      !post.approvedAt ||
      post.approvedAt > asOf
    )
      return [];
    const snapshot = snapshotAt(post, asOf);
    return [
      {
        ...post,
        views: snapshot?.views ?? null,
        reactions: snapshot?.reactions ?? 0,
      },
    ];
  });
}

/** employeeId → rank, for previousRank. */
export function rankMap(
  board: Pick<RankedBoard<RankableEmployee>, "entries">,
): Map<string, number> {
  return new Map(board.entries.map((entry) => [entry.employee.id, entry.rank]));
}
