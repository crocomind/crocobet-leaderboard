"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { SubmitPostProvider } from "@/components/submit/submit-post-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isApiError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/types";
import type { Locale } from "@/lib/i18n/config";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry network/server errors once; client errors (4xx) won't fix themselves.
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status >= 400 && error.status < 500) &&
          failureCount < 1,
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({
  locale,
  sessionUser,
  children,
}: {
  locale: Locale;
  sessionUser: SessionUser | null;
  children: ReactNode;
}) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLocale={locale}>
          {/* Skips transform/layout animations for users who prefer reduced motion. */}
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={250}>
              <CurrentUserProvider sessionUser={sessionUser}>
                <SubmitPostProvider>{children}</SubmitPostProvider>
              </CurrentUserProvider>
            </TooltipProvider>
          </MotionConfig>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
