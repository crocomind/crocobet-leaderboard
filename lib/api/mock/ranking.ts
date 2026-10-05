import type {
  Employee,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  PlatformFilter,
  Post,
} from "../types";
import { metricValue } from "@/lib/leaderboard";
import { DAY_MS } from "./data";

/** Mock formula. The real backend owns this. */
export const REACTION_WEIGHT = 10;

export function combinedScore(views: number, reactions: number): number {
  return views + reactions * REACTION_WEIGHT;
}

export interface TimeWindow {
  start: number;
  end: number;
}

const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, "all">, number> = {
  week: 7,
  month: 30,
};

/** Rolling windows: last 7 days, last 30 days, or everything. */
export function periodWindow(
  period: LeaderboardPeriod,
  now: number,
): TimeWindow {
  if (period === "all") return { start: Number.NEGATIVE_INFINITY, end: now };
  return { start: now - PERIOD_DAYS[period] * DAY_MS, end: now };
}

/** The window before the current one, for rank-change arrows. "all" compares with a week ago. */
export function previousWindow(
  period: LeaderboardPeriod,
  now: number,
): TimeWindow {
  if (period === "all")
    return { start: Number.NEGATIVE_INFINITY, end: now - 7 * DAY_MS };
  const length = PERIOD_DAYS[period] * DAY_MS;
  return { start: now - 2 * length, end: now - length };
}

export function postTimestamp(post: Post): number {
  return post.postedAt
    ? new Date(`${post.postedAt}T12:00:00`).getTime()
    : Date.parse(post.submittedAt);
}

export function countsTowardsRanking(
  post: Post,
  platform: PlatformFilter,
  window: TimeWindow,
): boolean {
  if (post.status !== "verified") return false;
  if (platform !== "all" && post.platform !== platform) return false;
  const time = postTimestamp(post);
  return time > window.start && time <= window.end;
}

/** Ranks everyone with at least one counted post. previousRank is left null. */
export function rankEmployees(
  employees: readonly Employee[],
  posts: readonly Post[],
  options: {
    metric: LeaderboardMetric;
    platform: PlatformFilter;
    window: TimeWindow;
  },
): LeaderboardEntry[] {
  const totals = new Map<
    string,
    { postCount: number; views: number; reactions: number }
  >();
  for (const post of posts) {
    if (!countsTowardsRanking(post, options.platform, options.window)) continue;
    const current = totals.get(post.employeeId) ?? {
      postCount: 0,
      views: 0,
      reactions: 0,
    };
    current.postCount += 1;
    current.views += post.views;
    current.reactions += post.reactions;
    totals.set(post.employeeId, current);
  }

  const unranked = employees.flatMap((employee) => {
    const total = totals.get(employee.id);
    if (!total) return [];
    return [
      {
        employee,
        postCount: total.postCount,
        totalViews: total.views,
        totalReactions: total.reactions,
        score: combinedScore(total.views, total.reactions),
      },
    ];
  });

  unranked.sort(
    (a, b) =>
      metricValue(b, options.metric) - metricValue(a, options.metric) ||
      b.score - a.score ||
      a.employee.name.localeCompare(b.employee.name),
  );

  return unranked.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    previousRank: null,
  }));
}
