"use client";

import { Eye, Heart } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/** "12.4K · 830" with icons: views and reactions on video, reactions only on static. */
export function ScoreBreakdown({
  views,
  reactions,
  className,
}: {
  views: number | null;
  reactions: number;
  className?: string;
}) {
  const { formatCompact } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-xs font-medium text-muted-foreground tabular-nums [&_svg]:size-3.5",
        className,
      )}
    >
      {views !== null && (
        <span className="inline-flex items-center gap-1">
          <Eye aria-hidden="true" />
          {formatCompact(views)}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Heart aria-hidden="true" />
        {formatCompact(reactions)}
      </span>
    </span>
  );
}
