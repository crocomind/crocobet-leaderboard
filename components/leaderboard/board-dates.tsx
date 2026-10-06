"use client";

import { CalendarDays } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { BoardPeriod } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/70 px-3 text-xs font-medium text-muted-foreground backdrop-blur";

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
