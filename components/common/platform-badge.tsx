import { PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "size-5 rounded-md [&_svg]:size-3",
  sm: "size-6 rounded-lg [&_svg]:size-3.5",
  md: "size-8 rounded-[10px] [&_svg]:size-[18px]",
  lg: "size-10 rounded-xl [&_svg]:size-5",
} as const;

interface PlatformBadgeProps {
  platform: Platform;
  size?: keyof typeof sizes;
  className?: string;
}

/** Platform icon on its brand-colored tile. Decorative; label the context instead. */
export function PlatformBadge({
  platform,
  size = "md",
  className,
}: PlatformBadgeProps) {
  const definition = PLATFORMS[platform];
  const Icon = definition.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-white shadow-sm ring-1 ring-white/15 ring-inset",
        sizes[size],
        className,
      )}
      style={{ background: definition.badge }}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
}
