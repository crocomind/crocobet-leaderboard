"use client";

import { Play, Plus, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { EASE_IN_OUT_SOFT, springGentle } from "@/lib/motion";
import { PLATFORM_LIST } from "@/lib/platforms";

// Where each platform tile floats around the centerpiece.
const TILE_POSITIONS = [
  { className: "top-2 left-6", rotate: -12, delay: 0 },
  { className: "top-0 right-8", rotate: 10, delay: 0.6 },
  { className: "bottom-4 left-0", rotate: 8, delay: 1.1 },
  { className: "right-0 bottom-2", rotate: -8, delay: 0.3 },
];

/** Friendly empty state: floating platform tiles around a glowing play card. */
export function EmptyPosts({ onSubmit }: { onSubmit: () => void }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="flex flex-col items-center rounded-panel border border-border bg-surface/70 px-6 py-12 text-center shadow-soft backdrop-blur sm:py-16">
      <div aria-hidden="true" className="relative h-44 w-64">
        <div className="absolute inset-6 rounded-full bg-[radial-gradient(closest-side,var(--blob),transparent)] blur-xl" />

        {PLATFORM_LIST.slice(0, TILE_POSITIONS.length).map(
          (platform, index) => {
            const tile = TILE_POSITIONS[index]!;
            return (
              <motion.div
                key={platform.id}
                className={`absolute ${tile.className}`}
                style={{ rotate: tile.rotate }}
                // Gentle idle float; off with reduced motion.
                animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                transition={{
                  duration: 3.6,
                  repeat: Infinity,
                  ease: EASE_IN_OUT_SOFT,
                  delay: tile.delay,
                }}
              >
                <PlatformBadge
                  platform={platform.id}
                  size="lg"
                  className="shadow-lifted"
                />
              </motion.div>
            );
          },
        )}

        <motion.div
          className="absolute top-1/2 left-1/2 flex h-28 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[1.75rem] border border-border-strong bg-elevated shadow-lifted"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springGentle}
        >
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
            <Play className="size-5 translate-x-px fill-current" />
          </span>
          <span className="mt-3 h-1.5 w-12 rounded-full bg-border-strong" />
          <span className="mt-1.5 h-1.5 w-8 rounded-full bg-border" />
          <Sparkles className="absolute -top-3 -right-3 size-6 text-gold" />
        </motion.div>
      </div>

      <h2 className="mt-6 text-xl font-bold text-balance">
        {t.myPosts.empty.title}
      </h2>
      <MotionButton size="lg" className="mt-7" onClick={onSubmit}>
        <Plus strokeWidth={2.5} aria-hidden="true" />
        {t.myPosts.empty.cta}
      </MotionButton>
    </div>
  );
}
