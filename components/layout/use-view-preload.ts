"use client";

import { useCallback } from "react";
import { usePrefetchAdmin, usePrefetchMyPosts } from "@/lib/api/queries";
import type { AppView } from "@/lib/url-state";

/** Starts loading a view's code and data before it opens (on hover, focus or in idle time). */
export function useViewPreload() {
  const prefetchMyPosts = usePrefetchMyPosts();
  const prefetchAdmin = usePrefetchAdmin();
  return useCallback(
    (view: AppView) => {
      if (view === "my-posts") void prefetchMyPosts();
      if (view === "admin") {
        // The same chunk next/dynamic loads in AppShell.
        void import("@/components/admin/admin-view");
        prefetchAdmin();
      }
    },
    [prefetchMyPosts, prefetchAdmin],
  );
}
