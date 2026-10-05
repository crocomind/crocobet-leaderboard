"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import { useStartSyncMutation, useSyncStatusQuery } from "@/lib/api/queries";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

/** The last metrics sync and a "Refresh now" button (one manual run every 15 minutes). */
export function SyncPanel({
  onMessage,
  className,
}: {
  onMessage: (text: string, tone?: "success" | "error") => void;
  className?: string;
}) {
  const { t, format, formatRelativeTime } = useI18n();
  const status = useSyncStatusQuery();
  const start = useStartSyncMutation();
  const now = useNow();
  const last = status.data?.runs[0];
  // Compared with the fetch time (refreshed every 2 s while a run is going).
  const running =
    last !== undefined &&
    (last.finishedAt === null ||
      Date.parse(last.finishedAt) > status.dataUpdatedAt);

  return (
    <section
      aria-labelledby="sync-heading"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface/80 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 id="sync-heading" className="text-sm font-semibold">
          {t.admin.sync.title}
        </h2>
        {status.isPending ? (
          <Skeleton className="mt-1.5 h-3.5 w-48 rounded-md" />
        ) : !last ? (
          <p className="text-sm text-muted-foreground">{t.admin.sync.never}</p>
        ) : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {running ? (
              t.admin.sync.running
            ) : (
              <>
                {format(t.admin.sync.lastRun, {
                  time:
                    (now > 0 &&
                      formatRelativeTime(
                        last.finishedAt ?? last.startedAt,
                        now,
                      )) ||
                    t.common.justNow,
                })}{" "}
                · {t.admin.sync.triggers[last.trigger]} ·{" "}
                {format(t.admin.sync.counts, {
                  ok: last.postsOk,
                  failed: last.postsFailed,
                })}
              </>
            )}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.admin.sync.schedule}
        </p>
      </div>
      <MotionButton
        variant="secondary"
        size="sm"
        loading={start.isPending || running}
        loadingLabel={t.admin.sync.running}
        onClick={() =>
          start.mutate(undefined, {
            onSuccess: () => onMessage(t.admin.toasts.syncStarted),
            onError: (error) =>
              onMessage(
                isApiError(error) && error.code === "rate_limited"
                  ? t.admin.toasts.tooSoon
                  : t.admin.toasts.error,
                "error",
              ),
          })
        }
        className="self-start sm:self-auto"
      >
        <RefreshCw aria-hidden="true" />
        {t.admin.sync.refreshNow}
      </MotionButton>
    </section>
  );
}
