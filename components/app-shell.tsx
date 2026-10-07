"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { Header } from "@/components/layout/header";
import { MobileSubmitFab } from "@/components/layout/mobile-submit-fab";
import { ViewNav } from "@/components/layout/view-nav";
import { ListSkeleton } from "@/components/leaderboard/leaderboard-skeleton";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { MyPostsView } from "@/components/my-posts/my-posts-view";
import { ProfileView } from "@/components/profile/profile-view";
import { useI18n } from "@/components/providers/i18n-provider";
import { SubmitPostDialog } from "@/components/submit/submit-post-dialog";
import { useViewPreload } from "@/components/layout/use-view-preload";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { DURATION, exitTween, REDUCED_FADE, tween } from "@/lib/motion";

// Loaded on demand, and only for admins (see AdminGate).
const AdminView = dynamic(() => import("@/components/admin/admin-view"), {
  loading: () => <ListSkeleton />,
});
const ParticipantsView = dynamic(
  () => import("@/components/admin/participants-view"),
  { loading: () => <ListSkeleton /> },
);

export function AppShell() {
  const { t } = useI18n();
  const { state } = useAppUrlState();
  const reduceMotion = useReducedMotion() ?? false;

  // Once the first screen has settled, load the other views in the background
  // so switching to them is instant.
  const preload = useViewPreload();
  const isAdmin = useCurrentUser().user?.role === "admin";
  useEffect(() => {
    const timer = setTimeout(() => {
      preload("my-posts");
      if (isAdmin) {
        preload("admin");
        preload("participants");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [preload, isAdmin]);

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="sr-only rounded-control bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
      >
        {t.app.skipToContent}
      </a>

      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pt-5 pb-40 outline-none sm:px-6 md:pt-10"
      >
        <ViewNav id="nav-mobile" className="mb-6 md:hidden" />
        {/* Views crossfade: the old one fades out and drifts up 8px while the
            new one fades up into place (--dur-slow). No hard cuts. */}
        <div className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              // A different person's profile fades in like a new view.
              key={
                state.view === "profile"
                  ? `profile:${state.employee}`
                  : state.view
              }
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: reduceMotion ? REDUCED_FADE : tween(DURATION.slow),
              }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: REDUCED_FADE }
                  : { opacity: 0, y: -8, transition: exitTween(DURATION.slow) }
              }
            >
              {state.view === "leaderboard" ? (
                <LeaderboardView />
              ) : state.view === "admin" ? (
                <AdminGate>
                  <AdminView />
                </AdminGate>
              ) : state.view === "participants" ? (
                <AdminGate>
                  <ParticipantsView />
                </AdminGate>
              ) : state.view === "profile" ? (
                <ProfileView />
              ) : (
                <MyPostsView />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <MobileSubmitFab />
      <SubmitPostDialog />
    </div>
  );
}
