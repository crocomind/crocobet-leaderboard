"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { EASE_OUT_SOFT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  className?: string;
  /** Count up from 0 on first render (big stats). Rows start at their value. */
  animateOnMount?: boolean;
  durationSeconds?: number;
}

/**
 * Counts smoothly between values. Text is written straight to the DOM, so a
 * list of animated numbers never re-renders React per frame. Screen readers
 * get the final value only. Reduced motion shows the value immediately.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  animateOnMount = true,
  durationSeconds = 0.9,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const textRef = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const from = shown.current ?? (animateOnMount ? 0 : value);
    if (reduceMotion || from === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }

    node.textContent = format(Math.round(from));
    const controls = animate(from, value, {
      duration: durationSeconds,
      ease: EASE_OUT_SOFT,
      onUpdate: (current) => {
        shown.current = current;
        node.textContent = format(Math.round(current));
      },
    });
    return () => controls.stop();
  }, [value, format, reduceMotion, animateOnMount, durationSeconds]);

  return (
    <span className={cn("tabular-nums", className)}>
      <span ref={textRef} aria-hidden="true" />
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
