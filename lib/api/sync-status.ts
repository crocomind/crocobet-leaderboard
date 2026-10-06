import type { SyncRun } from "./types";

/** A run that hasn't finished within this long has crashed (the server's rule too). */
export const STALE_SYNC_MS = 15 * 60_000;

/**
 * Whether the latest run was still going when the status was fetched. The
 * sync panel and its polling use this same rule, so they never disagree.
 */
export function syncInProgress(
  run: SyncRun | undefined,
  fetchedAt: number,
): boolean {
  if (!run) return false;
  if (run.finishedAt !== null) return Date.parse(run.finishedAt) > fetchedAt;
  return fetchedAt - Date.parse(run.startedAt) < STALE_SYNC_MS;
}
