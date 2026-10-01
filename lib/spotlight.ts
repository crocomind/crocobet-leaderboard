import type { PointerEvent } from "react";

const pending = new WeakMap<HTMLElement, { x: number; y: number }>();

/**
 * onPointerMove handler for elements with the `card-spotlight` utility. It
 * writes the cursor position to --spot-x/--spot-y at most once per frame and
 * never re-renders React. Ignores touch and pen, where the effect is off.
 */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const element = event.currentTarget;
  const scheduled = pending.has(element);
  pending.set(element, { x: event.clientX, y: event.clientY });
  if (scheduled) return;

  requestAnimationFrame(() => {
    const point = pending.get(element);
    pending.delete(element);
    if (!point) return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--spot-x", `${point.x - rect.left}px`);
    element.style.setProperty("--spot-y", `${point.y - rect.top}px`);
  });
}
