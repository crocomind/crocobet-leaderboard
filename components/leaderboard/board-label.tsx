"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { useRoundLabel } from "@/components/leaderboard/use-round-label";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardStatus, Round } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** A leaderboard's name: the round's label, or "3-Month Challenge". */
export function useBoardLabel() {
  const { t } = useI18n();
  const roundLabel = useRoundLabel();
  return (board: { round: Round | null }, timeZone: string) =>
    board.round
      ? roundLabel(board.round, board.round.startsAt, timeZone)
      : t.periods.all;
}

export function StatusBadge({
  status,
  className,
}: {
  status: LeaderboardStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const copy = t.admin.leaderboards.status;
  return (
    <Badge
      variant={status === "running" ? "brand" : "neutral"}
      className={cn("px-2", status === "finished" && "opacity-70", className)}
    >
      {status === "running" ? copy.current : copy[status]}
    </Badge>
  );
}
