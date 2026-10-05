"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, type RefCallback } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { PlatformLogos } from "@/components/common/platform-logos";
import { RankChange } from "@/components/leaderboard/rank-change";
import { TopPostLink } from "@/components/leaderboard/top-post-link";
import { useEntryLabel } from "@/components/leaderboard/use-entry-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { ContentCategory, LeaderboardEntry } from "@/lib/api/types";
import { enterUp, springLayout, STAGGER } from "@/lib/motion";
import { trackSpotlight } from "@/lib/spotlight";
import { cn } from "@/lib/utils";

// rank | employee | posts | [views] | reactions | score | change | top post
const DESKTOP_COLUMNS: Record<ContentCategory, string> = {
  video:
    "md:grid-cols-[3rem_minmax(0,1fr)_4rem_6rem_6rem_6.5rem_4.5rem_2.25rem] md:gap-4",
  static:
    "md:grid-cols-[3rem_minmax(0,1fr)_4rem_6rem_6.5rem_4.5rem_2.25rem] md:gap-4",
};
const MOBILE_COLUMNS = "grid-cols-[2.25rem_minmax(0,1fr)_auto_2.25rem] gap-3";

export const MEDAL_CHIP: Record<number, string> = {
  1: "bg-gold",
  2: "bg-silver",
  3: "bg-bronze",
};

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  category: ContentCategory;
  currentUserId: string | undefined;
  onSelect: (entry: LeaderboardEntry) => void;
  myEntryRef: RefCallback<HTMLElement>;
  dimmed?: boolean;
}

// Memoized so typing in the search box doesn't re-measure every row's layout.
export const LeaderboardList = memo(function LeaderboardList({
  entries,
  category,
  currentUserId,
  onSelect,
  myEntryRef,
  dimmed,
}: LeaderboardListProps) {
  const { t } = useI18n();
  const video = category === "video";

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
          DESKTOP_COLUMNS[category],
        )}
      >
        <span>{t.leaderboard.columns.rank}</span>
        <span>{t.leaderboard.columns.employee}</span>
        <span className="text-right">{t.leaderboard.columns.posts}</span>
        {video && (
          <span className="text-right">{t.leaderboard.columns.views}</span>
        )}
        <span className="text-right">{t.leaderboard.columns.reactions}</span>
        <span className="text-right text-brand-text">
          {t.leaderboard.columns.score}
        </span>
        <span className="text-right">{t.leaderboard.columns.change}</span>
        <span />
      </div>

      <ol className="relative flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {entries.map((entry, index) => (
            <LeaderboardRow
              key={entry.employee.id}
              entry={entry}
              index={index}
              category={category}
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
  category: ContentCategory;
  isMe: boolean;
  onSelect: (entry: LeaderboardEntry) => void;
  myEntryRef: RefCallback<HTMLElement>;
}

function LeaderboardRow({
  entry,
  index,
  category,
  isMe,
  onSelect,
  myEntryRef,
}: LeaderboardRowProps) {
  const { t, formatCompact, plural } = useI18n();
  const entryLabel = useEntryLabel();
  const medal = MEDAL_CHIP[entry.rank];

  // Numbers count to their new value when filters change. The cells are
  // hidden from screen readers: the row's button label says it all.
  const stat = (value: number, highlighted = false) => (
    <span
      aria-hidden="true"
      className="pointer-events-none hidden text-right md:block"
    >
      <AnimatedNumber
        value={value}
        format={formatCompact}
        animateOnMount={false}
        className={
          highlighted
            ? "text-base font-bold text-foreground"
            : "text-sm text-muted-foreground"
        }
      />
    </span>
  );

  return (
    // Re-sorting moves rows to their new place with springLayout.
    <motion.li
      layout="position"
      {...enterUp(index, STAGGER.rows)}
      transition={{ layout: springLayout }}
    >
      {/* The card holds the row's button and, beside it, the top-post link. */}
      <div
        onPointerMove={trackSpotlight}
        className={cn(
          "relative grid w-full items-center rounded-control border px-3 py-3 md:rounded-card md:px-5",
          // Hover: lift 2px, faint green border, deeper shadow, cursor spotlight.
          "card-depth card-spotlight hover-lift motion-lift motion-safe:has-[>button:active]:scale-[0.99]",
          MOBILE_COLUMNS,
          DESKTOP_COLUMNS[category],
          isMe
            ? "border-brand/45 bg-brand/10 shadow-glow hover:border-brand/60 hover:bg-brand/15"
            : "border-border bg-surface/80 shadow-soft hover:border-brand/30 hover:bg-surface",
        )}
      >
        <button
          type="button"
          ref={isMe ? myEntryRef : undefined}
          aria-label={entryLabel(entry, isMe)}
          aria-haspopup="dialog"
          onClick={() => onSelect(entry)}
          className="absolute inset-0 scroll-mt-24 scroll-mb-32 rounded-[inherit]"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none flex justify-center md:justify-start"
        >
          {medal ? (
            <span
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold text-on-medal shadow-sm",
                medal,
              )}
            >
              {entry.rank}
            </span>
          ) : (
            <span className="text-sm font-bold text-muted-foreground tabular-nums md:text-base">
              {entry.rank}
            </span>
          )}
        </span>

        <span
          aria-hidden="true"
          className="pointer-events-none flex min-w-0 items-center gap-3"
        >
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
              <PlatformLogos platforms={entry.platforms} className="ml-0.5" />
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

        <span
          aria-hidden="true"
          className="pointer-events-none hidden text-right text-sm text-muted-foreground tabular-nums md:block"
        >
          {entry.postCount}
        </span>
        {category === "video" && stat(entry.totalViews ?? 0)}
        {stat(entry.totalReactions)}
        {stat(entry.score, true)}

        {/* Mobile: the score and the change, stacked. */}
        <span
          aria-hidden="true"
          className="pointer-events-none flex flex-col items-end gap-0.5 md:hidden"
        >
          <AnimatedNumber
            value={entry.score}
            format={formatCompact}
            animateOnMount={false}
            className="font-bold"
          />
          <RankChange entry={entry} />
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none hidden justify-end md:flex"
        >
          <RankChange entry={entry} />
        </span>

        <span className="flex justify-end">
          <TopPostLink entry={entry} className="-mr-1.5" />
        </span>
      </div>
    </motion.li>
  );
}
