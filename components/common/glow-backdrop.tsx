import { cn } from "@/lib/utils";

/** Soft radial brand glow placed behind a hero area. Decorative. */
export function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 -z-10 h-[34rem]",
        className,
      )}
    >
      <div className="absolute top-0 left-1/2 h-full w-[min(64rem,160vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--blob),transparent)] opacity-90 blur-2xl" />
      <div className="absolute top-1/4 right-[-10%] h-2/3 w-[min(32rem,90vw)] rounded-full bg-[radial-gradient(closest-side,var(--blob-secondary),transparent)] blur-2xl" />
    </div>
  );
}
