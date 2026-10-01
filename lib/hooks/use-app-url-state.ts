"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  type AppUrlState,
  parseUrlState,
  serializeUrlState,
} from "@/lib/url-state";

type HistoryMode = "push" | "replace";

/**
 * Reads and writes the app state in the URL without a navigation or server
 * round trip. Next.js keeps useSearchParams in sync with history.pushState and
 * replaceState. Views push (so Back works); filters replace.
 */
export function useAppUrlState() {
  const searchParams = useSearchParams();
  const state = useMemo(() => parseUrlState(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<AppUrlState>, mode: HistoryMode = "replace") => {
      const current = parseUrlState(
        new URLSearchParams(window.location.search),
      );
      const next = `${window.location.pathname}${serializeUrlState({ ...current, ...patch })}`;
      if (next === `${window.location.pathname}${window.location.search}`)
        return;
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        next,
      );
    },
    [],
  );

  const setView = useCallback(
    (view: AppUrlState["view"]) => {
      update({ view }, "push");
      window.scrollTo({ top: 0 });
    },
    [update],
  );

  return { state, update, setView };
}

/** href for a view link, keeping the current filters. */
export function useViewHref() {
  const searchParams = useSearchParams();
  return useCallback(
    (view: AppUrlState["view"]) =>
      `/${serializeUrlState({ ...parseUrlState(searchParams), view })}`,
    [searchParams],
  );
}
