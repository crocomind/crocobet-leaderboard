"use client";

import { ImageIcon, Play } from "lucide-react";
import { useState } from "react";
import { PlatformBadge } from "@/components/common/platform-badge";
import {
  type ContentCategory,
  PLATFORMS,
  type Platform,
} from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface PostThumbnailProps {
  platform: Platform;
  /** Static posts show an image icon instead of a play button. */
  category?: ContentCategory;
  thumbnailUrl?: string | null;
  className?: string;
  /** Small square thumbnails hide the badge and shrink the icon. */
  compact?: boolean;
}

/**
 * The real thumbnail if the backend has one, otherwise a platform-tinted
 * placeholder. Provider CDN links expire, so a failed image falls back too.
 */
export function PostThumbnail({
  platform,
  category = "video",
  thumbnailUrl,
  className,
  compact,
}: PostThumbnailProps) {
  const { color } = PLATFORMS[platform];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(thumbnailUrl) && failedUrl !== thumbnailUrl;
  const Icon = category === "video" ? Play : ImageIcon;

  return (
    <div
      aria-hidden="true"
      className={cn("relative isolate overflow-hidden bg-elevated", className)}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 15% 10%, color-mix(in oklab, ${color} 38%, transparent), transparent 60%), linear-gradient(160deg, color-mix(in oklab, ${color} 16%, var(--bg-elevated)), var(--bg-surface))`,
      }}
    >
      {showImage && thumbnailUrl ? (
        // Thumbnails come from arbitrary platform CDNs, so next/image's host allowlist doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(thumbnailUrl)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-white/90 text-black/80 shadow-lg backdrop-blur",
              compact ? "size-7 [&_svg]:size-3.5" : "size-12 [&_svg]:size-5",
            )}
          >
            <Icon
              className={
                category === "video" ? "translate-x-px fill-current" : ""
              }
            />
          </span>
        </div>
      )}
      {!compact && (
        <PlatformBadge
          platform={platform}
          size="sm"
          className="absolute top-3 left-3"
        />
      )}
    </div>
  );
}
