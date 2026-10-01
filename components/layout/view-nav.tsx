"use client";

import { Clapperboard, type LucideIcon, Trophy } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import type { MouseEvent } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { usePrefetchMyVideos } from "@/lib/api/queries";
import { useAppUrlState, useViewHref } from "@/lib/hooks/use-app-url-state";
import type { AppView } from "@/lib/url-state";
import { springLayout } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ITEMS: ReadonlyArray<{ view: AppView; icon: LucideIcon }> = [
  { view: "leaderboard", icon: Trophy },
  { view: "my-videos", icon: Clapperboard },
];

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Real links (shareable, open in a new tab), but a plain click switches the
 * view client-side without a navigation.
 */
export function ViewNav({ id, className }: { id: string; className?: string }) {
  const { t } = useI18n();
  const { state, setView } = useAppUrlState();
  const viewHref = useViewHref();
  const prefetchMyVideos = usePrefetchMyVideos();
  const labels: Record<AppView, string> = {
    leaderboard: t.nav.leaderboard,
    "my-videos": t.nav.myVideos,
  };

  return (
    <nav aria-label={t.nav.label} className={className}>
      <LayoutGroup id={id}>
        <ul className="isolate flex rounded-full border border-border bg-surface/70 p-1 shadow-soft">
          {ITEMS.map(({ view, icon: Icon }) => {
            const active = state.view === view;
            return (
              <li key={view} className="flex flex-1">
                <a
                  href={viewHref(view)}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => {
                    if (!isPlainLeftClick(event)) return;
                    event.preventDefault();
                    if (!active) setView(view);
                  }}
                  onPointerEnter={
                    view === "my-videos"
                      ? () => void prefetchMyVideos()
                      : undefined
                  }
                  onFocus={
                    view === "my-videos"
                      ? () => void prefetchMyVideos()
                      : undefined
                  }
                  className={cn(
                    "relative flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap",
                    "press motion-press focus-visible:outline-offset-0",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="indicator"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-full border border-border-strong bg-elevated shadow-soft"
                      transition={springLayout}
                    />
                  )}
                  <Icon
                    className={cn(
                      "size-4 motion-colors",
                      active && "text-brand-text",
                    )}
                    aria-hidden="true"
                  />
                  {labels[view]}
                </a>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
