"use client";

import { useRankChangeLabel } from "@/components/leaderboard/rank-change";
import { useI18n } from "@/components/providers/i18n-provider";
import type { LeaderboardEntry } from "@/lib/api/types";
import { PLATFORMS } from "@/lib/platforms";

/** Full spoken description of a ranked employee, used as the entry's accessible name. */
export function useEntryLabel() {
  const { t, format, plural, formatList } = useI18n();
  const changeLabel = useRankChangeLabel();

  return (entry: LeaderboardEntry, isMe: boolean) => {
    const stats = [
      plural(t.common.posts, entry.postCount),
      entry.totalViews !== null
        ? plural(t.metrics.units.views, entry.totalViews)
        : null,
      plural(t.metrics.units.reactions, entry.totalReactions),
      plural(t.metrics.units.score, entry.score),
      formatList(entry.platforms.map((platform) => PLATFORMS[platform].name)),
    ]
      .filter(Boolean)
      .join(", ");

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
