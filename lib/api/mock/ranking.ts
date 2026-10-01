import type {
  Employee,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  PlatformFilter,
  Video,
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

export function videoTimestamp(video: Video): number {
  return video.postedAt
    ? new Date(`${video.postedAt}T12:00:00`).getTime()
    : Date.parse(video.submittedAt);
}

export function countsTowardsRanking(
  video: Video,
  platform: PlatformFilter,
  window: TimeWindow,
): boolean {
  if (video.status !== "verified") return false;
  if (platform !== "all" && video.platform !== platform) return false;
  const time = videoTimestamp(video);
  return time > window.start && time <= window.end;
}

/** Ranks everyone with at least one counted video. previousRank is left null. */
export function rankEmployees(
  employees: readonly Employee[],
  videos: readonly Video[],
  options: {
    metric: LeaderboardMetric;
    platform: PlatformFilter;
    window: TimeWindow;
  },
): LeaderboardEntry[] {
  const totals = new Map<
    string,
    { videoCount: number; views: number; reactions: number }
  >();
  for (const video of videos) {
    if (!countsTowardsRanking(video, options.platform, options.window))
      continue;
    const current = totals.get(video.employeeId) ?? {
      videoCount: 0,
      views: 0,
      reactions: 0,
    };
    current.videoCount += 1;
    current.views += video.views;
    current.reactions += video.reactions;
    totals.set(video.employeeId, current);
  }

  const unranked = employees.flatMap((employee) => {
    const total = totals.get(employee.id);
    if (!total) return [];
    return [
      {
        employee,
        videoCount: total.videoCount,
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
