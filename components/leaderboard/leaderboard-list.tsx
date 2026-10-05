"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, type RefCallback } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { RankChange } from "@/components/leaderboard/rank-change";
import { useEntryLabel } from "@/components/leaderboard/use-entry-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/api/types";
import { metricValue } from "@/lib/leaderboard";
import { enterUp, springLayout, STAGGER } from "@/lib/motion";
import { trackSpotlight } from "@/lib/spotlight";
import { cn } from "@/lib/utils";

// rank | employee | posts | views | reactions | score | change
const DESKTOP_COLUMNS =
  "md:grid-cols-[3rem_minmax(0,1fr)_4.5rem_6.5rem_6.5rem_6.5rem_4.5rem] md:gap-4";
const MOBILE_COLUMNS = "grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-3";

const MEDAL_TEXT: Record<number, string> = {
  1: "text-gold",
  2: "text-silver",
  3: "text-bronze",
};

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currentUserId: string | undefined;
  onSelect: (entry: LeaderboardEntry) => void;
  myEntryRef: RefCallback<HTMLElement>;
  dimmed?: boolean;
}

// Memoized so typing in the search box doesn't re-measure every row's layout.
export const LeaderboardList = memo(function LeaderboardList({
  entries,
  metric,
  currentUserId,
  onSelect,
  myEntryRef,
  dimmed,
}: LeaderboardListProps) {
  const { t } = useI18n();

  const columns: Array<{
    key: string;
    label: string;
    metric?: LeaderboardMetric;
  }> = [
    { key: "posts", label: t.leaderboard.columns.posts },
    { key: "views", label: t.leaderboard.columns.views, metric: "views" },
    {
      key: "reactions",
      label: t.leaderboard.columns.reactions,
      metric: "reactions",
    },
    { key: "score", label: t.leaderboard.columns.score, metric: "score" },
  ];

  return (
    <section
      aria-labelledby="rankings-heading"
      className={cn(
        "transition-opacity duration-(--dur-base) ease-(--ease-out-soft)",
        dimmed && "opacity-60",
      )}
    >
      <h2 id="rankings-heading" className="sr-only">
        {t.leaderboard.listLabel}
      </h2>

      {/* Visual column headers; each row carries a full accessible label. */}
      <div
        aria-hidden="true"
        className={cn(
          "mb-2 hidden px-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid",
          DESKTOP_COLUMNS,
        )}
      >
        <span>{t.leaderboard.columns.rank}</span>
        <span>{t.leaderboard.columns.employee}</span>
        {columns.map((column) => (
          <span
            key={column.key}
            className={cn(
              "text-right motion-colors [transition-duration:var(--dur-base)]",
              column.metric === metric && "text-brand-text",
            )}
          >
            {column.label}
          </span>
        ))}
        <span className="text-right">{t.leaderboard.columns.change}</span>
      </div>

      <ol className="relative flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {entries.map((entry, index) => (
            <LeaderboardRow
              key={entry.employee.id}
              entry={entry}
              index={index}
              metric={metric}
              isMe={entry.employee.id === currentUserId}
              onSelect={onSelect}
              myEntryRef={myEntryRef}
            />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
});

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  index: number;
  metric: LeaderboardMetric;
  isMe: boolean;
  onSelect: (entry: LeaderboardEntry) => void;
  myEntryRef: RefCallback<HTMLElement>;
}

function LeaderboardRow({
  entry,
  index,
  metric,
  isMe,
  onSelect,
  myEntryRef,
}: LeaderboardRowProps) {
  const { t, formatCompact, plural } = useI18n();
  const entryLabel = useEntryLabel();

  // Numbers count to their new value when filters change.
  const stat = (value: number, highlighted: boolean) => (
    <AnimatedNumber
      value={value}
      format={formatCompact}
      animateOnMount={false}
      className={cn(
        "hidden text-right motion-colors md:block",
        highlighted
          ? "text-base font-bold text-foreground"
          : "text-sm text-muted-foreground",
      )}
    />
  );

  return (
    // Re-sorting moves rows to their new place with springLayout.
    <motion.li
      layout="position"
      {...enterUp(index, STAGGER.rows)}
      transition={{ layout: springLayout }}
    >
      <button
        type="button"
        ref={isMe ? myEntryRef : undefined}
        aria-label={entryLabel(entry, isMe)}
        aria-haspopup="dialog"
        onClick={() => onSelect(entry)}
        onPointerMove={trackSpotlight}
        className={cn(
          "relative grid w-full scroll-mt-24 scroll-mb-32 items-center rounded-control border px-3 py-3 text-left md:rounded-card md:px-5",
          // Hover: lift 2px, faint green border, deeper shadow, cursor spotlight.
          "card-depth card-spotlight hover-lift press motion-lift [--press-scale:0.99]",
          MOBILE_COLUMNS,
          DESKTOP_COLUMNS,
          isMe
            ? "border-brand/45 bg-brand/10 shadow-glow hover:border-brand/60 hover:bg-brand/15"
            : "border-border bg-surface/80 shadow-soft hover:border-brand/30 hover:bg-surface",
        )}
      >
        <span
          className={cn(
            "text-center text-sm font-bold tabular-nums md:text-left md:text-base",
            MEDAL_TEXT[entry.rank] ?? "text-muted-foreground",
          )}
        >
          {entry.rank}
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <EmployeeAvatar
            employee={entry.employee}
            size="sm"
            className="md:size-10"
          />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">
                {entry.employee.name}
              </span>
              {isMe && (
                <Badge variant="brand" className="px-1.5 py-0">
                  {t.common.you}
                </Badge>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {entry.employee.department}
              <span className="md:hidden">
                {" "}
                · {plural(t.common.posts, entry.postCount)}
              </span>
            </span>
          </span>
        </span>

        <span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">
          {entry.postCount}
        </span>
        {stat(entry.totalViews, metric === "views")}
        {stat(entry.totalReactions, metric === "reactions")}
        {stat(entry.score, metric === "score")}

        {/* Mobile: the selected metric and the change, stacked on the right. */}
        <span className="flex flex-col items-end gap-0.5 md:hidden">
          <AnimatedNumber
            value={metricValue(entry, metric)}
            format={formatCompact}
            animateOnMount={false}
            className="font-bold"
          />
          <RankChange entry={entry} />
        </span>
        <RankChange entry={entry} className="hidden justify-end md:flex" />
      </button>
    </motion.li>
  );
}
