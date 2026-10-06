"use client";

import { useTheme } from "next-themes";
import { withViewTransition } from "@/lib/motion";

type Theme = "dark" | "light";

/**
 * Switches the theme with a soft full-page crossfade (--dur-slow,
 * --ease-in-out-soft) instead of an instant flip.
 */
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const theme: Theme = resolvedTheme === "light" ? "light" : "dark";

  const switchTo = (next: Theme) => {
    if (next === theme) return;
    withViewTransition(() => {
      // Apply synchronously so the transition captures the new theme;
      // next-themes then persists the choice.
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      root.classList.add(next);
      root.style.colorScheme = next;
      setTheme(next);
    });
  };

  return { theme, switchTo };
}
