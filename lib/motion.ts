import type { Transition } from "motion/react";

/*
 * Motion system: the one place to tune how the app moves.
 *
 * CSS uses the same easing curves and durations as custom properties
 * (--ease-out-soft, --ease-in-out-soft, --dur-fast, --dur-base, --dur-slow,
 * --hover-out) in app/globals.css. If you change a value here, change it there
 * too.
 */

// Easing
/** Default for hovers and entrances: quick start, long soft landing. */
export const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;
/** For state changes (toggles, theme and language switches, exits). */
export const EASE_IN_OUT_SOFT = [0.65, 0, 0.35, 1] as const;

// Durations (seconds)
export const DURATION = {
  /** Color and opacity. */
  fast: 0.2,
  /** Hover lifts, shadows, focus. */
  base: 0.3,
  /** Modals, view changes, large elements. */
  slow: 0.45,
} as const;

/** Hover-out runs this much slower than hover-in, so things settle instead of snapping back. */
export const HOVER_OUT_FACTOR = 1.3;
/** Exits take this fraction of the matching entrance. */
export const EXIT_FACTOR = 0.7;
/** Reduced motion: everything becomes a plain fade this long. */
export const REDUCED_FADE: Transition = { duration: 0.15, ease: "linear" };

// Springs
interface SpringPreset {
  type: "spring";
  stiffness: number;
  damping: number;
  mass?: number;
}

/** Hover lifts and cards. */
export const springSoft = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.9,
} as const;
/** Button press and release. Slightly underdamped for a tiny overshoot on release. */
export const springPress = {
  type: "spring",
  stiffness: 420,
  damping: 30,
} as const;
/** Reordering and sliding indicators. */
export const springLayout = {
  type: "spring",
  stiffness: 300,
  damping: 34,
} as const;
/** Modals, sheets and the podium. */
export const springGentle = {
  type: "spring",
  stiffness: 180,
  damping: 24,
} as const;

/**
 * The same spring, `factor` times slower. Stiffness scales by 1/factor² and
 * damping by 1/factor, which keeps the damping ratio, so it bounces the same,
 * only calmer.
 */
export function slower<S extends SpringPreset>(
  spring: S,
  factor = HOVER_OUT_FACTOR,
): S {
  return {
    ...spring,
    stiffness: spring.stiffness / factor ** 2,
    damping: spring.damping / factor,
  };
}

/** Spring options for useSpring(), which doesn't take `type`. */
export function springOptions({ stiffness, damping, mass }: SpringPreset) {
  return { stiffness, damping, mass };
}

export function tween(
  duration: number,
  ease: Transition["ease"] = EASE_OUT_SOFT,
): Transition {
  return { type: "tween", duration, ease };
}

/** A matching exit: shorter (EXIT_FACTOR) and eased in-out. */
export function exitTween(duration: number = DURATION.slow): Transition {
  return tween(duration * EXIT_FACTOR, EASE_IN_OUT_SOFT);
}

// Distances and amounts
export const LIFT = {
  /** Buttons lift this many px on hover. */
  button: 2,
  /** Podium cards (rows and video cards use --lift in CSS). */
  podium: 3,
} as const;

export const SCALE = {
  buttonHover: 1.02,
  buttonPress: 0.96,
  cardPress: 0.985,
} as const;

/** Maximum podium tilt toward the cursor, in degrees. */
export const TILT_MAX_DEG = 4.5;

/** Delay between items in staggered lists, in seconds. */
export const STAGGER = {
  rows: 0.035,
  list: 0.04,
  /** Stop adding delay after this many items so long lists don't lag. */
  maxItems: 12,
} as const;

export function staggerDelay(
  index: number,
  step: number = STAGGER.list,
): number {
  return Math.min(index, STAGGER.maxItems) * step;
}

// Reusable presets
/** Content that fades up into place (rows, cards, list items). */
export function enterUp(index = 0, step: number = STAGGER.list) {
  return {
    initial: { opacity: 0, y: 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { ...tween(DURATION.slow), delay: staggerDelay(index, step) },
    },
    exit: { opacity: 0, transition: exitTween(DURATION.fast) },
  };
}

/** Fine pointer with real hover: hover-only effects (lift, tilt, spotlight) run only here. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

let finePointer: MediaQueryList | undefined;

/** True on mouse/trackpad devices. Cheap enough to call in event handlers. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  finePointer ??= window.matchMedia(FINE_POINTER_QUERY);
  return finePointer.matches;
}

/**
 * Runs a DOM-changing update (theme or language switch) as a soft full-page
 * crossfade using the View Transitions API, where it's supported. Timing comes
 * from the ::view-transition rules in globals.css.
 */
export function withViewTransition(update: () => void) {
  if (typeof document === "undefined" || !("startViewTransition" in document)) {
    update();
    return;
  }
  document.startViewTransition(update);
}
