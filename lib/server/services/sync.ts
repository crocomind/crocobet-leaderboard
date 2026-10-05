import "server-only";
import { and, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { SyncTrigger } from "@/lib/api/types";
import { metricsRefreshOpen } from "@/lib/periods";
import type { Platform } from "@/lib/platforms";
import type { FetchOutcome } from "@/lib/post-data";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  posts,
  type PostRow,
  syncRuns,
  type SyncRunRow,
} from "@/lib/server/db/schema";
import { type PostDataProvider, providerFor } from "@/lib/server/providers";
import { applyFetch } from "@/lib/server/services/checks";

/** Any 64-bit number unique to this job. */
const LOCK_KEY = 7_412_026_101;
/** An unfinished run older than this has crashed and no longer blocks new runs. */
export const STALE_RUN_MS = 15 * 60_000;
/** Posts fetched more recently are skipped unless the run is forced. */
export const REFRESH_EVERY_MS = 6 * 3_600_000;
/** After 3 failed fetches in a row, a post is retried at most once a day. */
export const FAILED_RETRY_MS = 24 * 3_600_000;
const BATCH_SIZE = 25;
const CONCURRENCY = 3;
const PROVIDER_TIMEOUT_MS = 60_000;

const rowsOf = (result: unknown): Record<string, unknown>[] =>
  Array.isArray(result)
    ? (result as Record<string, unknown>[])
    : ((result as { rows?: Record<string, unknown>[] }).rows ?? []);

/**
 * Starts a run unless one is already going. Supabase's transaction pooler
 * can't hold a session-level advisory lock across statements, so the claim
 * is serialized with a transaction-level lock and the unfinished run row
 * itself marks the job as busy.
 */
export async function claimRun(
  db: Db,
  trigger: SyncTrigger,
  now: Date,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const locked = rowsOf(
      await tx.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`,
      ),
    )[0]?.locked;
    if (locked !== true) return null;
    const [running] = await tx
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(
        and(
          isNull(syncRuns.finishedAt),
          gt(syncRuns.startedAt, new Date(now.getTime() - STALE_RUN_MS)),
        ),
      )
      .limit(1);
    if (running) return null;
    const [run] = await tx
      .insert(syncRuns)
      .values({ trigger, startedAt: now })
      .returning({ id: syncRuns.id });
    return run?.id ?? null;
  });
}

/** Active posts (§4.7) that are due, oldest fetch first. */
export async function selectDuePosts(
  db: Db,
  config: ServerConfig,
  now: Date,
  force: boolean,
): Promise<PostRow[]> {
  if (!metricsRefreshOpen(now, config.campaign, config.metricsGraceDays))
    return [];
  const { startsAt, endsAt } = config.campaign;
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        inArray(posts.status, ["pending", "approved"]),
        or(
          isNull(posts.publishedAt),
          and(gte(posts.publishedAt, startsAt), lt(posts.publishedAt, endsAt)),
        ),
        force
          ? undefined
          : or(
              isNull(posts.metricsFetchedAt),
              lt(
                posts.metricsFetchedAt,
                new Date(now.getTime() - REFRESH_EVERY_MS),
              ),
            ),
      ),
    )
    .orderBy(sql`${posts.metricsFetchedAt} asc nulls first`);
  return rows.filter(
    (row) =>
      !(
        row.consecutiveFetchFailures >= 3 &&
        row.checkedAt &&
        now.getTime() - row.checkedAt.getTime() < FAILED_RETRY_MS
      ),
  );
}

async function pool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await work(items[next++]!);
    },
  );
  await Promise.all(runners);
}

export interface SyncOptions {
  trigger: SyncTrigger;
  now?: Date;
  /** Refresh every active post, even ones fetched in the last 6 hours. */
  force?: boolean;
  /** Stop starting new batches after this time (ms since the epoch). */
  deadline?: number;
  /** The time when each fetch is applied. */
  clock?: () => Date;
  providerFor?: (platform: Platform) => PostDataProvider;
}

export type SyncResult =
  | { status: "skipped"; reason: "already_running" }
  | { status: "done"; run: SyncRunRow; stoppedEarly: boolean };

/**
 * The twice-daily refresh (and "Refresh now"): fetches due posts from their
 * providers in batches and applies each result with the shared rules, which
 * also re-run the tag check and raise flags. Platforms on manual entry are
 * skipped: their numbers come from admins.
 */
export async function runSync(
  db: Db,
  config: ServerConfig,
  options: SyncOptions,
): Promise<SyncResult> {
  const runId = await claimRun(db, options.trigger, options.now ?? new Date());
  if (!runId) return { status: "skipped", reason: "already_running" };
  return executeRun(db, config, runId, options);
}

/** Does the work of a claimed run and finishes its row. */
export async function executeRun(
  db: Db,
  config: ServerConfig,
  runId: string,
  options: Omit<SyncOptions, "trigger">,
): Promise<Extract<SyncResult, { status: "done" }>> {
  const now = options.now ?? new Date();
  const clock = options.clock ?? (() => new Date());
  let ok = 0;
  let failed = 0;
  let stoppedEarly = false;
  let error: string | null = null;
  try {
    const due = await selectDuePosts(db, config, now, options.force ?? false);
    const pick =
      options.providerFor ??
      ((platform: Platform) => providerFor(platform, config));
    const groups = new Map<
      string,
      { provider: PostDataProvider; rows: PostRow[] }
    >();
    for (const row of due) {
      const provider = pick(row.platform);
      if (provider.id === "manual") continue;
      const group = groups.get(provider.id) ?? { provider, rows: [] };
      group.rows.push(row);
      groups.set(provider.id, group);
    }

    for (const { provider, rows } of groups.values()) {
      const batches: PostRow[][] = [];
      for (let i = 0; i < rows.length; i += BATCH_SIZE)
        batches.push(rows.slice(i, i + BATCH_SIZE));
      await pool(batches, CONCURRENCY, async (batch) => {
        if (options.deadline !== undefined && Date.now() > options.deadline) {
          stoppedEarly = true;
          return;
        }
        let outcomes: Map<string, FetchOutcome>;
        try {
          outcomes = await provider.fetchMany(
            batch.map((row) => ({
              platform: row.platform,
              contentType: row.contentType,
              url: row.urlCanonical,
              externalId: row.externalId,
              submittedAt: row.submittedAt,
            })),
            { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), now: clock() },
          );
        } catch (cause) {
          console.warn(`[sync] provider ${provider.id} failed`, cause);
          outcomes = new Map();
        }
        for (const selected of batch) {
          // Re-read: an admin may have changed the post since it was selected.
          const row = await db.query.posts.findFirst({
            where: eq(posts.id, selected.id),
          });
          if (!row || (row.status !== "pending" && row.status !== "approved"))
            continue;
          const outcome = outcomes.get(row.urlCanonical) ?? {
            ok: false as const,
            error: "provider_error" as const,
            retryable: true,
          };
          const result = await applyFetch(db, config, row, outcome, {
            now: clock(),
          });
          if (result.ok) ok += 1;
          else failed += 1;
        }
      });
    }
  } catch (cause) {
    console.error("[sync] run failed", cause);
    error = cause instanceof Error ? cause.message.slice(0, 500) : "failed";
  }

  const [run] = await db
    .update(syncRuns)
    .set({
      finishedAt: clock(),
      postsTotal: ok + failed,
      postsOk: ok,
      postsFailed: failed,
      error,
    })
    .where(eq(syncRuns.id, runId))
    .returning();
  return { status: "done", run: run!, stoppedEarly };
}
