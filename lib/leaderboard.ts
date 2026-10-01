import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/api/types";

export function metricValue(
  entry: Pick<LeaderboardEntry, "totalViews" | "totalReactions" | "score">,
  metric: LeaderboardMetric,
): number {
  if (metric === "views") return entry.totalViews;
  if (metric === "reactions") return entry.totalReactions;
  return entry.score;
}

export type RankChange =
  { kind: "up" | "down"; places: number } | { kind: "same" } | { kind: "new" };

/** Movement since the previous period. Positive "up" means the employee climbed. */
export function rankChange(
  entry: Pick<LeaderboardEntry, "rank" | "previousRank">,
): RankChange {
  if (entry.previousRank === null) return { kind: "new" };
  const delta = entry.previousRank - entry.rank;
  if (delta > 0) return { kind: "up", places: delta };
  if (delta < 0) return { kind: "down", places: -delta };
  return { kind: "same" };
}
