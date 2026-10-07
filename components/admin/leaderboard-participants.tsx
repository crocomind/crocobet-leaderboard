"use client";

import {
  Clapperboard,
  ImageIcon,
  RotateCcw,
  UserMinus,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { ErrorState } from "@/components/common/state-panel";
import {
  StatusBadge,
  useBoardLabel,
} from "@/components/leaderboard/board-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminLeaderboardQuery,
  useRemoveFromLeaderboardMutation,
  useRestoreToLeaderboardMutation,
} from "@/lib/api/queries";
import type {
  BoardParticipant,
  ContentCategory,
  LeaderboardInfo,
} from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

type OnMessage = (text: string, tone?: "success" | "error") => void;

/** "🎬 12 · 🖼 5": ranked people per category. */
export function ParticipantCounts({
  info,
  className,
}: {
  info: Pick<LeaderboardInfo, "participants" | "removedCount">;
  className?: string;
}) {
  const { t, format, plural } = useI18n();
  const copy = t.admin.leaderboards;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        <Clapperboard className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t.categories.video}: </span>
        {plural(copy.people, info.participants.video)}
      </span>
      <span className="inline-flex items-center gap-1">
        <ImageIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t.categories.static}: </span>
        {plural(copy.people, info.participants.static)}
      </span>
      {info.removedCount > 0 && (
        <span className="text-warning-text">
          {format(copy.removedCount, { count: info.removedCount })}
        </span>
      )}
    </span>
  );
}

/** Who's on a leaderboard, with remove and put back (admin). */
export function ParticipantsDialog({
  boardId,
  timeZone,
  onClose,
  onMessage,
}: {
  boardId: string | null;
  timeZone: string;
  onClose: () => void;
  onMessage: OnMessage;
}) {
  return (
    <ResponsiveDialog
      open={boardId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant="side"
      aria-describedby={undefined}
    >
      {boardId && (
        <ParticipantsPanel
          boardId={boardId}
          timeZone={timeZone}
          onClose={onClose}
          onMessage={onMessage}
        />
      )}
    </ResponsiveDialog>
  );
}

function ParticipantsPanel({
  boardId,
  timeZone,
  onClose,
  onMessage,
}: {
  boardId: string;
  timeZone: string;
  onClose: () => void;
  onMessage: OnMessage;
}) {
  const { t, format, plural, formatDateRange, formatRelativeTime } = useI18n();
  const copy = t.admin.leaderboards;
  const boardLabel = useBoardLabel();
  const now = useNow();
  const { openProfile } = useAppUrlState();
  const [category, setCategory] = useState<ContentCategory>("video");
  const query = useAdminLeaderboardQuery(boardId, category);
  const remove = useRemoveFromLeaderboardMutation();
  const restore = useRestoreToLeaderboardMutation();
  const [removing, setRemoving] = useState<BoardParticipant | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const data = query.data;
  const label = data ? boardLabel(data.leaderboard, timeZone) : "";

  const showProfile = (employeeId: string) => {
    onClose();
    openProfile(employeeId);
  };

  const confirmRemove = () => {
    if (!removing) return;
    const name = removing.employee.name;
    remove.mutate(
      { boardId, employeeId: removing.employee.id },
      {
        onSuccess: () => {
          setRemoving(null);
          onMessage(format(copy.removedToast, { name, board: label }));
        },
        onError: () => onMessage(copy.errors.generic, "error"),
      },
    );
  };

  return (
    <>
      <div className="flex items-start gap-3 px-5 pt-2 pb-3 md:px-6 md:pt-6">
        <div className="min-w-0 flex-1">
          <ResponsiveDialogTitle className="truncate">
            {data ? label : copy.participants}
          </ResponsiveDialogTitle>
          {data && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {formatDateRange(
                data.leaderboard.startsAt,
                data.leaderboard.endsAt,
                timeZone,
              )}
              <StatusBadge status={data.leaderboard.status} />
            </p>
          )}
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>

      <div className="px-5 pb-3 md:px-6">
        <SegmentedControl
          label={t.leaderboard.categoryLabel}
          value={category}
          onValueChange={setCategory}
          options={[
            { value: "video", label: t.categories.video },
            { value: "static", label: t.categories.static },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain px-5 pb-6 transition-opacity duration-(--dur-base) md:px-6",
          query.isPlaceholderData && "opacity-60",
        )}
      >
        {query.isError ? (
          <ErrorState
            title={copy.errors.generic}
            retryLabel={t.common.retry}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : !data ? (
          <div aria-busy="true" className="flex flex-col gap-2 pt-1">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-control" />
            ))}
          </div>
        ) : (
          <>
            {data.removed.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {copy.removedList}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {data.removed.map((person) => {
                    const time =
                      (now > 0 && formatRelativeTime(person.removedAt, now)) ||
                      t.common.justNow;
                    return (
                      <li
                        key={person.employee.id}
                        className="flex items-center gap-3 rounded-control border border-dashed border-border px-3 py-2"
                      >
                        <EmployeeAvatar
                          employee={person.employee}
                          size="sm"
                          className="opacity-60"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {person.employee.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {person.removedBy
                              ? format(copy.removedBy, {
                                  time,
                                  name: person.removedBy.name,
                                })
                              : format(copy.removedAt, { time })}
                          </p>
                        </div>
                        <MotionButton
                          variant="secondary"
                          size="sm"
                          loading={
                            restore.isPending &&
                            restoring === person.employee.id
                          }
                          onClick={() => {
                            setRestoring(person.employee.id);
                            restore.mutate(
                              { boardId, employeeId: person.employee.id },
                              {
                                onSuccess: () =>
                                  onMessage(
                                    format(copy.restoredToast, {
                                      name: person.employee.name,
                                      board: label,
                                    }),
                                  ),
                                onError: () =>
                                  onMessage(copy.errors.generic, "error"),
                              },
                            );
                          }}
                        >
                          <RotateCcw aria-hidden="true" />
                          {copy.restore}
                        </MotionButton>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {data.participants.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {copy.emptyBoard}
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {data.participants.map((person) => (
                  <li
                    key={person.employee.id}
                    className="flex items-center gap-3 rounded-control border border-border bg-surface/60 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                      {person.rank}
                    </span>
                    <EmployeeAvatar employee={person.employee} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {person.employee.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {plural(t.metrics.units.score, person.score)} ·{" "}
                        {person.employee.email}
                      </p>
                    </div>
                    <MotionButton
                      variant="icon"
                      size="icon-sm"
                      aria-label={`${copy.viewProfile}: ${person.employee.name}`}
                      onClick={() => showProfile(person.employee.id)}
                    >
                      <UserRound aria-hidden="true" />
                    </MotionButton>
                    <MotionButton
                      variant="icon"
                      size="icon-sm"
                      aria-label={`${copy.remove}: ${person.employee.name}`}
                      onClick={() => {
                        remove.reset();
                        setRemoving(person);
                      }}
                      className="text-danger-text"
                    >
                      <UserMinus aria-hidden="true" />
                    </MotionButton>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={
          removing
            ? format(copy.removeTitle, {
                name: removing.employee.name,
                board: label,
              })
            : ""
        }
        confirmLabel={copy.remove}
        destructive
        pending={remove.isPending}
        onConfirm={confirmRemove}
      />
    </>
  );
}
