"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

/** "Last updated 4 minutes ago" with a live dot. Stats sync periodically on the backend. */
export function LastUpdated({
  syncedAt,
  updating,
  className,
}: {
  syncedAt: string | undefined;
  updating: boolean;
  className?: string;
}) {
  const { t, format, formatRelativeTime } = useI18n();
  const now = useNow();

  const ready = syncedAt !== undefined && now > 0;
  const relative = ready
    ? (formatRelativeTime(syncedAt, now) ?? t.common.justNow)
    : "";

  return (
    <p
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/70 px-3 text-xs font-medium text-muted-foreground backdrop-blur",
        className,
      )}
    >
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {updating || !ready ? (
        <span>{t.leaderboard.updating}</span>
      ) : (
        <time dateTime={syncedAt}>
          {format(t.leaderboard.lastUpdated, { time: relative })}
        </time>
      )}
    </p>
  );
}
