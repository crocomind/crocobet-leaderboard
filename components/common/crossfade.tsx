"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { DURATION, exitTween, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Crossfades between states (skeleton → content → error → empty) instead of
 * swapping them in one frame. Change `stateKey` to trigger a crossfade. The
 * outgoing state is lifted out of the layout so both overlap.
 */
export function Crossfade({
  stateKey,
  children,
  className,
  contentClassName,
}: {
  stateKey: string;
  children: ReactNode;
  className?: string;
  /** For the wrapper around each state, e.g. to pass a flex layout through. */
  contentClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={stateKey}
          className={contentClassName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: tween(DURATION.base) }}
          exit={{ opacity: 0, transition: exitTween(DURATION.base) }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
