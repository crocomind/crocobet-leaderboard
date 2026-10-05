"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  type Transition,
  useAnimationControls,
  useReducedMotion,
} from "motion/react";
import { type ReactNode, useRef } from "react";
import {
  DURATION,
  hasFinePointer,
  LIFT,
  REDUCED_FADE,
  SCALE,
  slower,
  springLayout,
  springPress,
  springSoft,
  tween,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

export const motionButtonVariants = cva(
  [
    "relative isolate inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap motion-colors select-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "data-[loading=true]:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "btn-primary bg-primary text-primary-foreground hover:bg-brand-bright active:bg-brand-deep",
        secondary:
          "border border-border bg-surface text-foreground shadow-soft hover:border-border-strong hover:bg-elevated",
        ghost: "text-foreground hover:bg-hover",
        danger:
          "border border-danger/40 bg-danger/12 text-danger-text shadow-soft hover:border-danger/70 hover:bg-danger/20",
        icon: "rounded-full text-foreground hover:bg-hover",
      },
      size: {
        sm: "h-9 px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 px-5 text-sm [&_svg]:size-[18px]",
        lg: "h-14 px-7 text-base [&_svg]:size-5",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
    },
  },
);

type ButtonVariants = VariantProps<typeof motionButtonVariants>;

function variantClasses({ variant = "primary", size }: ButtonVariants) {
  return motionButtonVariants({
    variant,
    size: size ?? (variant === "icon" ? "icon" : "md"),
  });
}

/**
 * Spring hover and press, shared by MotionButton and MotionLinkButton.
 * Hover lifts with springSoft and settles back with a slower springSoft.
 * Press and release use springPress, which overshoots slightly on release.
 * Hover only runs on fine pointers; press works everywhere. With reduced
 * motion, a press is a short opacity fade.
 */
function usePressMotion(disabled: boolean) {
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotion() ?? false;
  const hovered = useRef(false);

  const toRest = (transition: Transition) =>
    void controls.start({ y: 0, scale: 1, transition });
  const toHover = (transition: Transition) =>
    void controls.start({
      y: -LIFT.button,
      scale: SCALE.buttonHover,
      transition,
    });

  const release = () => {
    if (reduceMotion)
      return void controls.start({ opacity: 1, transition: REDUCED_FADE });
    if (hovered.current) toHover(springPress);
    else toRest(springPress);
  };

  return {
    animate: controls,
    onHoverStart: () => {
      if (disabled || !hasFinePointer()) return;
      hovered.current = true;
      if (!reduceMotion) toHover(springSoft);
    },
    onHoverEnd: () => {
      if (!hovered.current) return;
      hovered.current = false;
      if (!reduceMotion) toRest(slower(springSoft));
    },
    onTapStart: () => {
      if (disabled) return;
      void controls.start(
        reduceMotion
          ? { opacity: 0.85, transition: REDUCED_FADE }
          : { y: 0, scale: SCALE.buttonPress, transition: springPress },
      );
    },
    onTap: release,
    onTapCancel: release,
  };
}

/** Glow and sheen layers for primary buttons (styled in globals.css). */
function PrimaryLayers({ variant }: ButtonVariants) {
  if (variant !== undefined && variant !== null && variant !== "primary")
    return null;
  return (
    <>
      <span aria-hidden="true" className="btn-glow" />
      <span aria-hidden="true" className="btn-sheen" />
    </>
  );
}

export interface MotionButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">, ButtonVariants {
  children?: ReactNode;
  /**
   * Pass a boolean to enable the loading state: the label crossfades into a
   * spinner (plus `loadingLabel`) and the button's width animates.
   */
  loading?: boolean;
  loadingLabel?: ReactNode;
}

/** The app's button: primary, secondary, ghost, danger or icon. */
export function MotionButton({
  className,
  variant,
  size,
  loading,
  loadingLabel,
  disabled,
  type = "button",
  children,
  ...props
}: MotionButtonProps) {
  const hasLoadingState = loading !== undefined;
  const pressMotion = usePressMotion(Boolean(disabled || loading));

  return (
    <motion.button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(variantClasses({ variant, size }), className)}
      layout={hasLoadingState ? "size" : undefined}
      transition={{ layout: springLayout }}
      {...pressMotion}
      {...props}
    >
      <PrimaryLayers variant={variant} />
      {hasLoadingState ? (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={loading ? "loading" : "idle"}
            layout="position"
            className="inline-flex items-center justify-center gap-2"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={tween(DURATION.fast)}
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                {loadingLabel}
              </>
            ) : (
              children
            )}
          </motion.span>
        </AnimatePresence>
      ) : (
        children
      )}
    </motion.button>
  );
}

export interface MotionLinkButtonProps
  extends Omit<HTMLMotionProps<"a">, "children">, ButtonVariants {
  children?: ReactNode;
}

/** A link that looks and moves like MotionButton. */
export function MotionLinkButton({
  className,
  variant,
  size,
  children,
  ...props
}: MotionLinkButtonProps) {
  const pressMotion = usePressMotion(false);
  return (
    <motion.a
      className={cn(variantClasses({ variant, size }), className)}
      {...pressMotion}
      {...props}
    >
      <PrimaryLayers variant={variant} />
      {children}
    </motion.a>
  );
}
