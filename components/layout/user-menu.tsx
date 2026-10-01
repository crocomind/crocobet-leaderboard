"use client";

import {
  CircleAlert,
  Languages,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { flushSync } from "react-dom";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { useThemeSwitch } from "@/components/layout/theme-toggle";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MotionButton } from "@/components/ui/motion-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isLocale,
  type Locale,
  LOCALE_NAMES,
  LOCALES,
} from "@/lib/i18n/config";
import { withViewTransition } from "@/lib/motion";

export function UserMenu() {
  const { t, locale, setLocale } = useI18n();
  const { theme, switchTo } = useThemeSwitch();
  const current = useCurrentUser();

  // Language changes crossfade the page like theme changes do.
  const switchLocale = (next: Locale) => {
    if (next === locale) return;
    withViewTransition(() => flushSync(() => setLocale(next)));
  };

  if (current.status === "loading") {
    return (
      <span role="status" className="inline-flex">
        <Skeleton className="size-10 rounded-full" />
        <span className="sr-only">{t.header.profileLoading}</span>
      </span>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <MotionButton variant="icon" aria-label={t.header.accountMenu}>
          {current.status === "success" ? (
            <EmployeeAvatar
              employee={current.user}
              size="sm"
              className="size-10 ring-2 ring-border-strong"
            />
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-danger/12 text-danger-text">
              <CircleAlert className="size-5" aria-hidden="true" />
            </span>
          )}
        </MotionButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {current.status === "success" ? (
          <div className="flex items-center gap-3 px-3 pt-2 pb-3">
            <EmployeeAvatar employee={current.user} size="md" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{current.user.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {current.user.email}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {current.user.department}
              </p>
            </div>
          </div>
        ) : (
          <DropdownMenuGroup>
            <p className="px-3 pt-2 pb-1 text-sm text-danger-text">
              {t.header.profileError}
            </p>
            <DropdownMenuItem onSelect={current.refetch}>
              <RefreshCw />
              {t.common.retry}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t.header.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "dark" || value === "light") switchTo(value);
          }}
        >
          <DropdownMenuRadioItem
            value="dark"
            onSelect={(event) => event.preventDefault()}
          >
            <Moon />
            {t.header.themeDark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="light"
            onSelect={(event) => event.preventDefault()}
          >
            <Sun />
            {t.header.themeLight}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Languages className="size-3.5" aria-hidden="true" />
          {t.header.language}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (isLocale(value)) switchLocale(value);
          }}
        >
          {LOCALES.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              lang={option}
              onSelect={(event) => event.preventDefault()}
            >
              {LOCALE_NAMES[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        {/* Placeholder until Entra ID sign-in is added (see README). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuItem disabled className="cursor-not-allowed">
              <LogOut />
              {t.header.signOut}
              <Badge className="ml-auto">{t.header.comingSoon}</Badge>
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="left">{t.header.comingSoon}</TooltipContent>
        </Tooltip>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
