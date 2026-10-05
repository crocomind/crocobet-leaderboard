"use client";

import { CalendarDays } from "lucide-react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PostThumbnail } from "@/components/common/post-thumbnail";
import { useI18n } from "@/components/providers/i18n-provider";
import { PLATFORMS, type Platform } from "@/lib/platforms";

interface PostPreviewCardProps {
  platform: Platform;
  url: string;
  title: string;
  postedAt: string;
}

/** What will be submitted: shown once the link is valid. */
export function PostPreviewCard({
  platform,
  url,
  title,
  postedAt,
}: PostPreviewCardProps) {
  const { t, format, formatDate } = useI18n();

  return (
    <figure aria-label={t.submit.previewLabel}>
      <figcaption className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t.submit.previewLabel}
      </figcaption>
      <div className="flex gap-3.5 rounded-card border border-border bg-surface/80 p-3 shadow-soft">
        <PostThumbnail
          platform={platform}
          compact
          className="h-24 w-[4.5rem] shrink-0 rounded-2xl"
        />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <PlatformBadge platform={platform} size="xs" />
            {PLATFORMS[platform].name}
          </p>
          <p
            className={
              title
                ? "mt-1.5 line-clamp-2 font-medium"
                : "mt-1.5 font-medium text-muted-foreground italic"
            }
          >
            {title || t.submit.previewTitle}
          </p>
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={url}
          >
            {url.replace(/^https:\/\//, "")}
          </p>
          {postedAt && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {format(t.myPosts.posted, { date: formatDate(postedAt) })}
            </p>
          )}
        </div>
      </div>
    </figure>
  );
}
