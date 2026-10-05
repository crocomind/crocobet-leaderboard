"use client";

import { ArrowDown, ArrowUp, Plus, SearchX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import type {
  Employee,
  LeaderboardMetric,
  LeaderboardStanding,
} from "@/lib/api/types";
import { useIsClient } from "@/lib/hooks/use-is-client";
import {
  DURATION,
  exitTween,
  REDUCED_FADE,
  springGentle,
  tween,
} from "@/lib/motion";

export type StandingAction =
  "scroll-up" | "scroll-down" | "clear-search" | "submit";

interface MyStandingBarProps {
  visible: boolean;
  user: Employee | null;
  standing: LeaderboardStanding | null;
  metric: LeaderboardMetric;
  action: StandingAction;
  onAction: (action: StandingAction) => void;
}

/**
 * Pinned to the bottom while the signed-in user's own row is off screen:
 * "You're #14 · 2,300 views behind #13".
 */
export function MyStandingBar({
  visible,
  user,
  standing,
  metric,
  action,
  onAction,
}: MyStandingBarProps) {
  const { t, format, plural } = useI18n();

  const headline = standing
    ? format(t.leaderboard.standing.rank, { rank: standing.entry.rank })
    : t.leaderboard.standing.notRanked;

  let detail: string = t.leaderboard.standing.notRankedHint;
  if (standing) {
    const nextRank = standing.entry.rank - 1;
    if (standing.gapToNext === null) detail = t.leaderboard.standing.leading;
    else if (standing.gapToNext === 0)
      detail = format(t.leaderboard.standing.tied, { nextRank });
    else
      detail = format(t.leaderboard.standing.behind, {
        gap: plural(t.metrics.units[metric], standing.gapToNext),
        nextRank,
      });
  }

  const actionLabel =
    action === "submit"
      ? t.header.submitPost
      : action === "clear-search"
        ? t.leaderboard.clearSearch
        : t.leaderboard.standing.show;

  const ActionIcon =
    action === "submit"
      ? Plus
      : action === "clear-search"
        ? SearchX
        : action === "scroll-up"
          ? ArrowUp
          : ArrowDown;

  const isClient = useIsClient();
  const reduceMotion = useReducedMotion() ?? false;

  // Portaled to <body>: a fixed element inside the view wrapper would move
  // with the wrapper's transform during view transitions.
  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {visible && user && (
        <motion.aside
          aria-label={t.leaderboard.standing.label}
          initial={reduceMotion ? { opacity: 0 } : { y: 96, opacity: 0 }}
          animate={{
            y: 0,
            opacity: 1,
            transition: reduceMotion ? REDUCED_FADE : springGentle,
          }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: REDUCED_FADE }
              : { y: 96, opacity: 0, transition: exitTween() }
          }
          className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 pr-[5.25rem] pl-4 md:px-6"
        >
          <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-card border border-brand/40 bg-glass p-2 pl-2.5 shadow-lifted backdrop-blur-xl md:p-2.5 md:pl-3">
            <EmployeeAvatar
              employee={user}
              size="sm"
              className="ring-2 ring-brand/50"
            />
            {/* New standing text fades in when filters change. */}
            <motion.div
              key={`${headline}|${detail}`}
              className="min-w-0 flex-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tween(DURATION.base) }}
            >
              <p className="truncate text-sm font-bold">{headline}</p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {detail}
              </p>
            </motion.div>
            <MotionButton
              size="sm"
              variant={action === "submit" ? "primary" : "secondary"}
              onClick={() => onAction(action)}
              aria-label={actionLabel}
              className="shrink-0"
            >
              <ActionIcon aria-hidden="true" />
              <span className="hidden sm:inline" aria-hidden="true">
                {actionLabel}
              </span>
            </MotionButton>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
