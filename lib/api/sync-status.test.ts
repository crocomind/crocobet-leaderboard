import { describe, expect, it } from "vitest";
import { STALE_SYNC_MS, syncInProgress } from "./sync-status";
import type { SyncRun } from "./types";

const at = Date.parse("2026-10-20T10:00:00Z");
const run = (overrides: Partial<SyncRun>): SyncRun => ({
  id: "run",
  trigger: "manual",
  startedAt: new Date(at - 60_000).toISOString(),
  finishedAt: null,
  postsTotal: 0,
  postsOk: 0,
  postsFailed: 0,
  error: null,
  ...overrides,
});

describe("syncInProgress", () => {
  it("is false without runs or after the run finished", () => {
    expect(syncInProgress(undefined, at)).toBe(false);
    expect(
      syncInProgress(run({ finishedAt: new Date(at - 1).toISOString() }), at),
    ).toBe(false);
  });

  it("is true while the run is going, judged at fetch time", () => {
    expect(syncInProgress(run({}), at)).toBe(true);
    // The mock reports a finish time in the future while it "runs".
    expect(
      syncInProgress(
        run({ finishedAt: new Date(at + 2_000).toISOString() }),
        at,
      ),
    ).toBe(true);
  });

  it("treats a run that never finished as crashed after 15 minutes", () => {
    expect(
      syncInProgress(
        run({ startedAt: new Date(at - STALE_SYNC_MS - 1).toISOString() }),
        at,
      ),
    ).toBe(false);
  });
});
