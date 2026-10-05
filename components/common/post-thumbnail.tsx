import { Play } from "lucide-react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface PostThumbnailProps {
  platform: Platform;
  thumbnailUrl?: string | null;
  className?: string;
  /** Small square thumbnails hide the badge and shrink the play icon. */
  compact?: boolean;
}

/** The real thumbnail if the backend has one, otherwise a platform-tinted placeholder. */
export function PostThumbnail({
  platform,
  thumbnailUrl,
  className,
  compact,
}: PostThumbnailProps) {
  const { color } = PLATFORMS[platform];

  return (
    <div
      aria-hidden="true"
      className={cn("relative isolate overflow-hidden bg-elevated", className)}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 15% 10%, color-mix(in oklab, ${color} 38%, transparent), transparent 60%), linear-gradient(160deg, color-mix(in oklab, ${color} 16%, var(--bg-elevated)), var(--bg-surface))`,
      }}
    >
      {thumbnailUrl ? (
        // Thumbnails come from arbitrary platform CDNs, so next/image's host allowlist doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
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
            <Play className="translate-x-px fill-current" />
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
