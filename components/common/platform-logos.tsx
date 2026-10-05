import { PlatformBadge } from "@/components/common/platform-badge";
import type { Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** The platforms an employee posted on, as tiny logos. Decorative; the row label names them. */
export function PlatformLogos({
  platforms,
  className,
}: {
  platforms: readonly Platform[];
  className?: string;
}) {
  if (platforms.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center gap-1", className)}
    >
      {platforms.map((platform) => (
        <PlatformBadge key={platform} platform={platform} size="2xs" />
      ))}
    </span>
  );
}
