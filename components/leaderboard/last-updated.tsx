"use client";

import { CalendarDays } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { BoardPeriod } from "@/lib/api/types";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/70 px-3 text-xs font-medium text-muted-foreground backdrop-blur";

/** "Last updated 4 minutes ago" with a live dot. Metrics refresh twice a day on the backend. */
export function LastUpdated({
  syncedAt,
  updating,
  className,
}: {
  /** undefined while loading; null before the first sync. */
  syncedAt: string | null | undefined;
  updating: boolean;
  className?: string;
}) {
  const { t, format, formatRelativeTime } = useI18n();
  const now = useNow();

  const ready = syncedAt !== undefined && now > 0;
  const relative =
    ready && syncedAt
      ? (formatRelativeTime(syncedAt, now) ?? t.common.justNow)
      : "";

  return (
    <p className={cn(PILL, className)}>
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {updating || !ready ? (
        <span>{t.leaderboard.updating}</span>
      ) : syncedAt ? (
        <time dateTime={syncedAt}>
          {format(t.leaderboard.lastUpdated, { time: relative })}
        </time>
      ) : (
        <span>{t.leaderboard.notSynced}</span>
      )}
    </p>
  );
}

/** The dates the board covers, e.g. "29 Sept – 5 Oct", in the campaign time zone. */
export function BoardDates({
  period,
  className,
}: {
  period: BoardPeriod | undefined;
  className?: string;
}) {
  const { t, format, formatDateRange } = useI18n();
  if (!period) return null;
  const range = formatDateRange(period.start, period.end, period.timeZone);
  return (
    <p className={cn(PILL, className)}>
      <CalendarDays className="size-3.5 text-brand-text" aria-hidden="true" />
      <span className="sr-only">
        {format(t.leaderboard.dateRange, { range })}
      </span>
      <time aria-hidden="true" dateTime={period.start}>
        {range}
      </time>
    </p>
  );
}
