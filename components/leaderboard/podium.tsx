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
import { PlatformLogos } from "@/components/common/platform-logos";
import { RankChange } from "@/components/leaderboard/rank-change";
import { ScoreBreakdown } from "@/components/leaderboard/score-breakdown";
import { TopPostLink } from "@/components/leaderboard/top-post-link";
import { useEntryLabel } from "@/components/leaderboard/use-entry-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardEntry } from "@/lib/api/types";
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
  /** Identifies the board shown; cards re-enter when it changes, even for the same person. */
  boardKey: string;
  entries: LeaderboardEntry[];
  currentUserId: string | undefined;
  onSelect: (entry: LeaderboardEntry) => void;
  /** Attached to the signed-in user's card, if they're on the podium. */
  myEntryRef: RefCallback<HTMLElement>;
}

export const Podium = memo(function Podium({
  boardKey,
  entries,
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
                    key={`${boardKey}:${entry.employee.id}`}
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
  isMe,
  onSelect,
  myEntryRef,
}: {
  rank: PodiumRank;
  entry: LeaderboardEntry;
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
    // The card holds the main button (stretched over it) and the top-post
    // link as siblings; the visible content is decoration for the button.
    <motion.div
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
      <button
        type="button"
        ref={isMe ? myEntryRef : undefined}
        aria-label={entryLabel(entry, isMe)}
        aria-haspopup="dialog"
        onClick={() => onSelect(entry)}
        className="absolute inset-0 z-[1] rounded-[inherit]"
      />

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

      <span
        aria-hidden="true"
        className="pointer-events-none flex w-full min-w-0 flex-col items-center"
      >
        {first && <Crown className="mb-2 size-6 fill-gold/30 text-gold" />}

        <span className="relative">
          <EmployeeAvatar
            employee={entry.employee}
            size={first ? "xl" : "lg"}
            className={cn("ring-4", medal.ring)}
          />
          <span
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
        <span className="flex w-full min-w-0 items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{entry.employee.department}</span>
          <PlatformLogos platforms={entry.platforms} />
        </span>

        <AnimatedNumber
          value={entry.score}
          format={formatNumber}
          className={cn(
            "mt-3 leading-none font-extrabold tracking-tight",
            first ? "text-4xl" : "text-2xl sm:text-3xl",
          )}
        />
        <span className="mt-1 text-xs font-medium text-muted-foreground">
          {t.metrics.score}
        </span>
        <ScoreBreakdown
          views={entry.totalViews}
          reactions={entry.totalReactions}
          className="mt-2"
        />

        <RankChange entry={entry} className="mt-3" />
      </span>

      <TopPostLink entry={entry} className="absolute top-2 right-2 z-[2]" />
    </motion.div>
  );
}
