"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import type { LeaderboardEntry } from "@/lib/api/types";
import { rankChange } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

function Triangle({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 10 8"
      className={cn("size-2.5", down && "rotate-180")}
      aria-hidden="true"
    >
      <path d="M5 0.5 9.5 7.5H0.5Z" fill="currentColor" />
    </svg>
  );
}

/** Text form of the rank change, for screen readers and labels. */
export function useRankChangeLabel() {
  const { t, plural } = useI18n();
  return (entry: Pick<LeaderboardEntry, "rank" | "previousRank">) => {
    const change = rankChange(entry);
    if (change.kind === "new") return t.leaderboard.rankChange.new;
    if (change.kind === "same") return t.leaderboard.rankChange.same;
    return plural(t.leaderboard.rankChange[change.kind], change.places);
  };
}

/** ▲2 / ▼1 / – / NEW compared with the previous period. */
export function RankChange({
  entry,
  className,
}: {
  entry: Pick<LeaderboardEntry, "rank" | "previousRank">;
  className?: string;
}) {
  const { t, formatNumber } = useI18n();
  const label = useRankChangeLabel()(entry);
  const change = rankChange(entry);

  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {change.kind === "up" && (
          <span className="inline-flex items-center gap-1 text-success-text">
            <Triangle />
            {formatNumber(change.places)}
          </span>
        )}
        {change.kind === "down" && (
          <span className="inline-flex items-center gap-1 text-danger-text">
            <Triangle down />
            {formatNumber(change.places)}
          </span>
        )}
        {change.kind === "same" && (
          <span className="text-muted-foreground">–</span>
        )}
        {change.kind === "new" && (
          <span className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] tracking-wide text-brand-text uppercase">
            {t.common.new}
          </span>
        )}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
