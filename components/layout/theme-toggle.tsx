"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { withViewTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

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

const iconClassName =
  "absolute transition-[opacity,rotate,scale] duration-(--dur-slow) ease-(--ease-in-out-soft)";

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const { theme, switchTo } = useThemeSwitch();

  // Icons and labels switch with CSS (the theme class is set before
  // hydration), so server and client render the same markup.
  return (
    <MotionButton
      variant="icon"
      className={className}
      onClick={() => switchTo(theme === "light" ? "dark" : "light")}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          iconClassName,
          "opacity-0 motion-safe:scale-75 motion-safe:-rotate-90 dark:scale-100 dark:rotate-0 dark:opacity-100",
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          iconClassName,
          "opacity-100 dark:opacity-0 motion-safe:dark:scale-75 motion-safe:dark:rotate-90",
        )}
      />
      <span className="sr-only hidden dark:inline">
        {t.header.switchToLight}
      </span>
      <span className="sr-only dark:hidden">{t.header.switchToDark}</span>
    </MotionButton>
  );
}
