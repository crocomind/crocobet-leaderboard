"use client";

import { useEffect, useState } from "react";

export type ViewportPosition = "visible" | "above" | "below";

/**
 * Where an element is relative to the viewport. The margins exclude the
 * sticky header (top) and the floating bottom bar, so an element hidden
 * behind either counts as off screen.
 */
export function useViewportPosition(
  element: Element | null,
  { top = 72, bottom = 112 }: { top?: number; bottom?: number } = {},
): ViewportPosition | null {
  const [position, setPosition] = useState<ViewportPosition | null>(null);

  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) setPosition("visible");
        else
          setPosition(entry.boundingClientRect.top < top ? "above" : "below");
      },
      { rootMargin: `-${top}px 0px -${bottom}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, top, bottom]);

  return element ? position : null;
}
