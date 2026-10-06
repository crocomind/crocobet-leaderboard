"use client";

import { useIsFetching } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useIsClient } from "@/lib/hooks/use-is-client";
import { DURATION, tween } from "@/lib/motion";

/**
 * A thin brand-green bar along the bottom of the header while something new
 * is loading: a board, a view or a filter that isn't cached yet. Background
 * refreshes and prefetches don't show it. It fades in after a short delay,
 * so quick loads don't flash it.
 */
export function TopLoadingBar() {
  const fetching = useIsFetching({
    predicate: (query) =>
      query.state.data === undefined && query.getObserversCount() > 0,
  });
  // Nothing until hydrated: the server never renders the bar.
  const isClient = useIsClient();
  const loading = isClient && fetching > 0;

  return (
    <AnimatePresence>
      {loading && (
        <motion.span
          role="progressbar"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { ...tween(DURATION.base), delay: 0.15 },
          }}
          exit={{ opacity: 0, transition: tween(DURATION.slow) }}
        >
          <span className="absolute inset-y-0 left-0 w-2/5 animate-loading-slide rounded-full bg-linear-to-r from-transparent via-brand to-transparent shadow-[0_0_10px_var(--color-brand)] motion-reduce:w-full motion-reduce:animate-pulse" />
        </motion.span>
      )}
    </AnimatePresence>
  );
}
