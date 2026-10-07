"use client";

import { Clapperboard, ImageIcon } from "lucide-react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PostThumbnail } from "@/components/common/post-thumbnail";
import { useI18n } from "@/components/providers/i18n-provider";
import { categoryOf, type ContentType, type Platform } from "@/lib/platforms";

interface PostPreviewCardProps {
  platform: Platform;
  contentType: ContentType;
  url: string;
  title: string;
}

/** What will be submitted, and which board it counts on: shown once the link is valid. */
export function PostPreviewCard({
  platform,
  contentType,
  url,
  title,
}: PostPreviewCardProps) {
  const { t, format } = useI18n();
  const category = categoryOf(contentType);
  const CategoryIcon = category === "video" ? Clapperboard : ImageIcon;

  return (
    <figure aria-label={t.submit.previewLabel}>
      <figcaption className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t.submit.previewLabel}
      </figcaption>
      <div className="flex gap-3.5 rounded-card border border-border bg-surface/80 p-3 shadow-soft">
        <PostThumbnail
          platform={platform}
          category={category}
          compact
          className="h-24 w-[4.5rem] shrink-0 rounded-2xl"
        />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <PlatformBadge platform={platform} size="xs" />
            {t.contentTypes[contentType]}
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
          <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-text">
            <CategoryIcon className="size-3.5" aria-hidden="true" />
            {format(t.submit.countsAs, { category: t.categories[category] })}
          </p>
        </div>
      </div>
    </figure>
  );
}
