"use client";

import { useRankChangeLabel } from "@/components/leaderboard/rank-change";
import { useI18n } from "@/components/providers/i18n-provider";
import type { LeaderboardEntry } from "@/lib/api/types";

/** Full spoken description of a ranked employee, used as the row's accessible name. */
export function useEntryLabel() {
  const { t, format, plural } = useI18n();
  const changeLabel = useRankChangeLabel();

  return (entry: LeaderboardEntry, isMe: boolean) => {
    const stats = [
      plural(t.common.videos, entry.videoCount),
      plural(t.metrics.units.views, entry.totalViews),
      plural(t.metrics.units.reactions, entry.totalReactions),
      plural(t.metrics.units.score, entry.score),
    ].join(", ");

    return format(t.leaderboard.rowLabel, {
      rank: entry.rank,
      name: isMe
        ? `${entry.employee.name} (${t.common.you})`
        : entry.employee.name,
      department: entry.employee.department,
      stats,
      change: changeLabel(entry),
    });
  };
}
