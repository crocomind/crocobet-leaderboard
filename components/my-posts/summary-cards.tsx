"use client";

import { CircleCheck, Clapperboard, Hourglass, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { useI18n } from "@/components/providers/i18n-provider";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardSummary, MyPostsResponse } from "@/lib/api/types";

export function SummaryCards({
  summary,
}: {
  summary: MyPostsResponse["summary"];
}) {
  const { t, formatNumber } = useI18n();

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <BoardCard
        icon={<Clapperboard />}
        label={t.categories.videoBoard}
        board={summary.boards.video}
      />
      <BoardCard
        icon={<ImageIcon />}
        label={t.categories.staticBoard}
        board={summary.boards.static}
      />
      <SummaryCard
        icon={<CircleCheck />}
        label={t.myPosts.summary.approved}
        hint={t.myPosts.summary.approvedHint}
      >
        <AnimatedNumber value={summary.approvedCount} format={formatNumber} />
      </SummaryCard>
      <SummaryCard
        icon={<Hourglass />}
        label={t.myPosts.summary.pending}
        hint={t.myPosts.summary.pendingHint}
      >
        <AnimatedNumber value={summary.pendingCount} format={formatNumber} />
      </SummaryCard>
    </dl>
  );
}

/** Rank and score on one board, for the whole challenge. */
function BoardCard({
  icon,
  label,
  board,
}: {
  icon: ReactNode;
  label: string;
  board: BoardSummary;
}) {
  const { t, format, formatNumber, plural } = useI18n();
  return (
    <SummaryCard
      icon={icon}
      label={label}
      hint={`${plural(t.metrics.units.score, board.score)} · ${t.myPosts.summary.period}`}
      highlight
    >
      {board.rank === null ? (
        <span className="text-lg font-semibold text-muted-foreground">
          {t.myPosts.summary.notRanked}
        </span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          <span>
            #<AnimatedNumber value={board.rank} format={formatNumber} />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {format(t.myPosts.summary.rankOf, {
              total: formatNumber(board.totalParticipants),
            })}
          </span>
        </span>
      )}
    </SummaryCard>
  );
}

function SummaryCard({
  icon,
  label,
  hint,
  highlight,
  children,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        highlight
          ? "relative overflow-hidden rounded-card border border-brand/35 bg-surface/85 p-4 shadow-glow backdrop-blur sm:p-5"
          : "rounded-card border border-border bg-surface/85 p-4 shadow-soft backdrop-blur sm:p-5"
      }
    >
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand-text [&_svg]:size-4"
        >
          {icon}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </dt>
      <dd className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">
        {children}
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="rounded-card border border-border bg-surface/70 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-20 rounded-md" />
          </div>
          <Skeleton className="mt-4 h-8 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
