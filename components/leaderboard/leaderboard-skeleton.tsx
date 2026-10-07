import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Slot classes per rank: #1 on top on phones, and the podium steps (see Podium). */
const SLOT = {
  1: "order-first col-span-2 sm:order-none sm:col-span-1",
  2: "sm:pt-8",
  3: "pt-6 sm:pt-16",
} as const;

export function PodiumSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      {([2, 1, 3] as const).map((rank) => (
        <div key={rank} className={cn("flex flex-col", SLOT[rank])}>
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-3 rounded-panel border border-border bg-surface/70 px-4 pt-7 pb-6",
              rank === 1 && "sm:pt-10 sm:pb-9",
            )}
          >
            <Skeleton
              className={cn("rounded-full", rank === 1 ? "size-20" : "size-14")}
            />
            <Skeleton className="mt-2 h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="mt-2 h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-control border border-border bg-surface/70 px-3 py-3 md:rounded-card md:px-5"
          style={{ opacity: 1 - i * 0.09 }}
        >
          <Skeleton className="h-4 w-6 rounded-md" />
          <Skeleton className="size-9 rounded-full md:size-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-[60%] rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="hidden h-4 w-14 rounded-md md:block" />
          <Skeleton className="hidden h-4 w-14 rounded-md md:block" />
        </div>
      ))}
    </div>
  );
}
