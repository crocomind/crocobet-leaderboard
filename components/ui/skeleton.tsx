import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shimmering placeholder. Static under prefers-reduced-motion. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton rounded-control", className)}
      {...props}
    />
  );
}
