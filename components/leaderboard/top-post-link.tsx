"use client";

import { ArrowUpRight } from "lucide-react";
import type { PointerEvent } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionLinkButton } from "@/components/ui/motion-button";
import type { LeaderboardEntry } from "@/lib/api/types";
import { safeExternalUrl } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * Opens the employee's top post. A sibling of the entry's main button, never
 * nested inside it, so both stay keyboard reachable.
 */
export function TopPostLink({
  entry,
  className,
}: {
  entry: LeaderboardEntry;
  className?: string;
}) {
  const { t, format } = useI18n();
  const href = safeExternalUrl(entry.topPost.url);
  if (!href) return null;

  return (
    <MotionLinkButton
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="icon"
      size="icon-sm"
      // Keeps the card's press animation for presses on the card itself.
      onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      className={cn(
        "relative z-10 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <ArrowUpRight aria-hidden="true" />
      <span className="sr-only">
        {format(t.leaderboard.topPostLabel, { name: entry.employee.name })} (
        {t.common.opensInNewTab})
      </span>
    </MotionLinkButton>
  );
}
