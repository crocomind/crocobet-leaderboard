"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  type TargetAndTransition,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { MotionButton } from "@/components/ui/motion-button";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import {
  DURATION,
  exitTween,
  REDUCED_FADE,
  springGentle,
  springLayout,
  tween,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

type Layout = "center" | "side" | "sheet";

interface PanelMotion {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
}

/** The backdrop starts fading in this long before the panel moves. */
const PANEL_DELAY = 0.06;

function panelMotion(layout: Layout, reduceMotion: boolean): PanelMotion {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: REDUCED_FADE },
      exit: { opacity: 0, transition: REDUCED_FADE },
    };
  }
  if (layout === "center") {
    // Fades, scales up and sharpens from a slight blur. The exit is quicker.
    return {
      initial: { opacity: 0, scale: 0.96, filter: "blur(4px)" },
      animate: {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        transition: {
          default: { ...springGentle, delay: PANEL_DELAY },
          opacity: { ...tween(DURATION.slow * 0.75), delay: PANEL_DELAY },
          filter: { ...tween(DURATION.slow), delay: PANEL_DELAY },
        },
        transitionEnd: { filter: "none" },
      },
      exit: {
        opacity: 0,
        scale: 0.97,
        filter: "blur(2px)",
        transition: exitTween(DURATION.slow),
      },
    };
  }
  const enter = { ...springGentle, delay: PANEL_DELAY };
  const exit = exitTween(DURATION.slow);
  if (layout === "side") {
    return {
      initial: { x: "100%" },
      animate: { x: 0, transition: enter },
      exit: { x: "100%", transition: exit },
    };
  }
  return {
    initial: { y: "100%" },
    animate: { y: 0, transition: enter },
    exit: { y: "100%", transition: exit },
  };
}

const layoutClassName: Record<Layout, string> = {
  center:
    "fixed top-1/2 left-1/2 max-h-[min(90dvh,860px)] w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel",
  side: "fixed inset-y-3 right-3 w-[min(calc(100vw-1.5rem),28rem)] rounded-panel",
  sheet:
    "fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-panel pb-[env(safe-area-inset-bottom)]",
};

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop layout. On small screens it's always a bottom sheet. */
  variant?: "center" | "side";
  children: ReactNode;
  className?: string;
  onOpenAutoFocus?: (event: Event) => void;
  /** Must be set when there's no <ResponsiveDialogDescription>. */
  "aria-describedby"?: string;
}

/**
 * Accessible dialog (Radix) with Motion transitions. It's a centered modal or
 * side panel on desktop and a swipe-to-dismiss bottom sheet on mobile. Radix
 * handles focus trap, Esc to close, scroll lock and aria wiring.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  variant = "center",
  children,
  className,
  onOpenAutoFocus,
  ...aria
}: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop();
  const layout: Layout = isDesktop ? variant : "sheet";
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion() ?? false;
  const transitions = panelMotion(layout, reduceMotion);

  // Dismiss on a long enough pull or a quick flick down.
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: reduceMotion
                    ? REDUCED_FADE
                    : tween(DURATION.slow * 0.8),
                }}
                exit={{
                  opacity: 0,
                  transition: reduceMotion
                    ? REDUCED_FADE
                    : { ...exitTween(DURATION.slow), delay: 0.04 },
                }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild
              forceMount
              onOpenAutoFocus={onOpenAutoFocus}
              {...aria}
            >
              <motion.div
                key={layout}
                className={cn(
                  "z-50 flex flex-col overflow-hidden border border-border bg-elevated/90 text-foreground shadow-lifted backdrop-blur-2xl outline-none",
                  layoutClassName[layout],
                  className,
                )}
                initial={transitions.initial}
                animate={transitions.animate}
                exit={transitions.exit}
                drag={layout === "sheet" ? "y" : false}
                dragControls={dragControls}
                dragListener={false}
                // Pulling down follows the finger; pulling up rubber-bands.
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.12, bottom: 0.7 }}
                dragTransition={{
                  bounceStiffness: springLayout.stiffness,
                  bounceDamping: springLayout.damping,
                }}
                onDragEnd={handleDragEnd}
              >
                {layout === "sheet" && (
                  <div
                    aria-hidden="true"
                    className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing"
                    onPointerDown={(event) => dragControls.start(event)}
                  >
                    <span className="h-1.5 w-11 rounded-full bg-border-strong" />
                  </div>
                )}
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export function ResponsiveDialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-xl font-bold tracking-tight text-balance", className)}
      {...props}
    />
  );
}

export function ResponsiveDialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-pretty text-muted-foreground", className)}
      {...props}
    />
  );
}

export function ResponsiveDialogClose({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <DialogPrimitive.Close asChild>
      <MotionButton
        variant="icon"
        size="icon"
        aria-label={label}
        className={cn(
          "size-10 text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <X className="size-5" />
      </MotionButton>
    </DialogPrimitive.Close>
  );
}
