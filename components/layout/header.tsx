"use client";

import { Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { TopLoadingBar } from "@/components/layout/top-loading-bar";
import { UserMenu } from "@/components/layout/user-menu";
import { ViewNav } from "@/components/layout/view-nav";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSubmitPost } from "@/components/submit/submit-post-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { useAppUrlState, useViewHref } from "@/lib/hooks/use-app-url-state";

export function Header() {
  const { t } = useI18n();
  const { openSubmit } = useSubmitPost();
  const { setView } = useAppUrlState();
  const viewHref = useViewHref();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-glass backdrop-blur-xl backdrop-saturate-150">
      <TopLoadingBar />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a
          href={viewHref("leaderboard")}
          className="rounded-lg"
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey
            )
              return;
            event.preventDefault();
            setView("leaderboard");
          }}
        >
          <Logo label={t.app.name} />
        </a>

        {/* Tablets: no nav icons and an icon-only submit button, so it all fits. */}
        <ViewNav
          id="nav-desktop"
          className="ml-4 hidden md:block [&_a>svg]:hidden lg:[&_a>svg]:block"
        />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <MotionButton
            className="hidden px-3 md:inline-flex lg:px-5"
            aria-label={t.header.submitPost}
            onClick={openSubmit}
          >
            <Plus strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden lg:inline">{t.header.submitPost}</span>
          </MotionButton>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
