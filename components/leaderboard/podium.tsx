"use client";

import { Crown } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { memo, type PointerEvent, type RefCallback, useRef } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { RankChange } from "@/components/leaderboard/rank-change";
import { useEntryLabel } from "@/components/leaderboard/use-entry-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/api/types";
import { metricValue } from "@/lib/leaderboard";
import {
  exitTween,
  hasFinePointer,
  LIFT,
  REDUCED_FADE,
  SCALE,
  springGentle,
  springOptions,
  springPress,
  springSoft,
  TILT_MAX_DEG,
} from "@/lib/motion";
import { trackSpotlight } from "@/lib/spotlight";
import { cn } from "@/lib/utils";

const MEDALS = {
  1: {
    ring: "ring-gold",
    chip: "bg-gold",
    wash: "from-gold/25",
    card: "border-gold/45 sm:pt-10 sm:pb-9",
    // DOM order stays 1-2-3 for screen readers; CSS order puts #1 in the middle.
    slot: "col-span-2 sm:col-span-1 sm:order-2",
  },
  2: {
    ring: "ring-silver",
    chip: "bg-silver",
    wash: "from-silver/20",
    card: "border-silver/30",
    slot: "sm:order-1",
  },
  3: {
    ring: "ring-bronze",
    chip: "bg-bronze",
    wash: "from-bronze/20",
    card: "border-bronze/35",
    slot: "sm:order-3",
  },
} as const;

type PodiumRank = keyof typeof MEDALS;

interface PodiumProps {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currentUserId: string | undefined;
  onSelect: (entry: LeaderboardEntry) => void;
  /** Attached to the signed-in user's card, if they're on the podium. */
  myEntryRef: RefCallback<HTMLElement>;
}

export const Podium = memo(function Podium({
  entries,
  metric,
  currentUserId,
  onSelect,
  myEntryRef,
}: PodiumProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section aria-labelledby="podium-heading">
      <h2 id="podium-heading" className="sr-only">
        {t.leaderboard.podiumLabel}
      </h2>
      <ol className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 sm:gap-4">
        {([1, 2, 3] as const).map((rank) => {
          const entry = entries.find((candidate) => candidate.rank === rank);
          return (
            <li key={rank} className={cn("min-w-0", MEDALS[rank].slot)}>
              <AnimatePresence mode="popLayout">
                {entry && (
                  // Cards rise in with springGentle, #3 first and #1 last.
                  <motion.div
                    key={entry.employee.id}
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 20, scale: 0.97 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97, transition: exitTween() }}
                    transition={
                      reduceMotion
                        ? REDUCED_FADE
                        : { ...springGentle, delay: (3 - rank) * 0.07 }
                    }
                  >
                    <PodiumCard
                      rank={rank}
                      entry={entry}
                      metric={metric}
                      isMe={entry.employee.id === currentUserId}
                      onSelect={onSelect}
                      myEntryRef={myEntryRef}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

/**
 * Tilts gently toward the cursor (up to TILT_MAX_DEG, springSoft) and lifts
 * on hover. Mouse only; no tilt on touch or with reduced motion.
 */
function useTilt() {
  const reduceMotion = useReducedMotion() ?? false;
  const rotateX = useSpring(0, springOptions(springSoft));
  const rotateY = useSpring(0, springOptions(springSoft));
  const y = useSpring(0, springOptions(springSoft));
  const bounds = useRef<DOMRect | null>(null);

  const enabled = (event: PointerEvent) =>
    event.pointerType === "mouse" && !reduceMotion && hasFinePointer();

  return {
    style: { rotateX, rotateY, y, transformPerspective: 900 },
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (!enabled(event)) return;
      bounds.current = event.currentTarget.getBoundingClientRect();
      y.set(-LIFT.podium);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      trackSpotlight(event);
      const box = bounds.current;
      if (!box || !enabled(event)) return;
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      rotateY.set(px * 2 * TILT_MAX_DEG);
      rotateX.set(-py * 2 * TILT_MAX_DEG);
    },
    onPointerLeave: () => {
      bounds.current = null;
      rotateX.set(0);
      rotateY.set(0);
      y.set(0);
    },
  };
}

function PodiumCard({
  rank,
  entry,
  metric,
  isMe,
  onSelect,
  myEntryRef,
}: {
  rank: PodiumRank;
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
  isMe: boolean;
  onSelect: (entry: LeaderboardEntry) => void;
  myEntryRef: RefCallback<HTMLElement>;
}) {
  const { t, formatNumber } = useI18n();
  const entryLabel = useEntryLabel();
  const medal = MEDALS[rank];
  const first = rank === 1;
  const tilt = useTilt();

  return (
    <motion.button
      type="button"
      ref={isMe ? myEntryRef : undefined}
      aria-label={entryLabel(entry, isMe)}
      aria-haspopup="dialog"
      onClick={() => onSelect(entry)}
      {...tilt}
      whileTap={{ scale: SCALE.cardPress }}
      transition={springPress}
      className={cn(
        "group relative isolate flex w-full flex-col items-center rounded-panel border bg-surface/85 px-3 pt-7 pb-6 text-center shadow-soft backdrop-blur",
        "card-depth card-spotlight motion-colors hover:will-change-transform",
        medal.card,
        isMe && "ring-2 ring-brand/60",
      )}
    >
      {/* #1 glow breathes slowly; only its opacity and scale animate. */}
      {first && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 animate-breathe rounded-[inherit] opacity-80 shadow-glow-gold"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 -z-10 h-28 rounded-t-panel bg-linear-to-b to-transparent",
          medal.wash,
        )}
      />

      {first && (
        <Crown
          className="mb-2 size-6 fill-gold/30 text-gold"
          aria-hidden="true"
        />
      )}

      <span className="relative">
        <EmployeeAvatar
          employee={entry.employee}
          size={first ? "xl" : "lg"}
          className={cn("ring-4", medal.ring)}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -bottom-2 left-1/2 inline-flex size-7 -translate-x-1/2 items-center justify-center rounded-full text-sm font-extrabold text-on-medal shadow-md ring-2 ring-surface",
            medal.chip,
          )}
        >
          {rank}
        </span>
      </span>

      <span className="mt-5 flex w-full min-w-0 items-center justify-center gap-1.5">
        <span
          className={cn(
            "truncate font-semibold",
            first ? "text-lg" : "text-base",
          )}
        >
          {entry.employee.name}
        </span>
        {isMe && (
          <Badge variant="brand" className="px-1.5">
            {t.common.you}
          </Badge>
        )}
      </span>
      <span className="w-full truncate text-xs text-muted-foreground">
        {entry.employee.department}
      </span>

      <AnimatedNumber
        value={metricValue(entry, metric)}
        format={formatNumber}
        className={cn(
          "mt-3 leading-none font-extrabold tracking-tight",
          first ? "text-4xl" : "text-2xl sm:text-3xl",
        )}
      />
      <span className="mt-1 text-xs font-medium text-muted-foreground">
        {metric === "score" ? t.metrics.scoreShort : t.metrics[metric]}
      </span>

      <RankChange entry={entry} className="mt-3" />
    </motion.button>
  );
}
