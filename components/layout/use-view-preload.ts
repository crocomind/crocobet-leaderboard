"use client";

import { useCallback } from "react";
import {
  usePrefetchAdmin,
  usePrefetchMyPosts,
  usePrefetchParticipants,
} from "@/lib/api/queries";
import type { AppView } from "@/lib/url-state";

/** Starts loading a view's code and data before it opens (on hover, focus or in idle time). */
export function useViewPreload() {
  const prefetchMyPosts = usePrefetchMyPosts();
  const prefetchAdmin = usePrefetchAdmin();
  const prefetchParticipants = usePrefetchParticipants();
  return useCallback(
    (view: AppView) => {
      if (view === "my-posts") void prefetchMyPosts();
      if (view === "admin") {
        // The same chunk next/dynamic loads in AppShell.
        void import("@/components/admin/admin-view");
        prefetchAdmin();
      }
      if (view === "participants") {
        void import("@/components/admin/participants-view");
        prefetchParticipants();
      }
    },
    [prefetchMyPosts, prefetchAdmin, prefetchParticipants],
  );
}
