"use client";

import { Languages, LoaderCircle, LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { useThemeSwitch } from "@/components/layout/theme-toggle";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MotionButton } from "@/components/ui/motion-button";
import {
  isLocale,
  type Locale,
  LOCALE_NAMES,
  LOCALES,
} from "@/lib/i18n/config";
import { signOut } from "@/lib/auth/client";
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

  const [signingOut, setSigningOut] = useState(false);

  if (current.status === "signed-out") return null;
  const { user } = current;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <MotionButton variant="icon" aria-label={t.header.accountMenu}>
          <EmployeeAvatar
            employee={user}
            size="sm"
            className="size-10 ring-2 ring-border-strong"
          />
        </MotionButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-3 pt-2 pb-3">
          <EmployeeAvatar employee={user} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
            {user.department && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {user.department}
              </p>
            )}
          </div>
        </div>

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
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            setSigningOut(true);
            void signOut();
          }}
        >
          {signingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          {signingOut ? t.header.signingOut : t.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
