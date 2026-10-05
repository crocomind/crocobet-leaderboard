import "server-only";
import type { Platform } from "@/lib/platforms";
import type { FetchOutcome, PostRef } from "@/lib/post-data";
import type { PostDataProvider } from "../types";
import { ACTORS, refKeys } from "./mapping";

const API = "https://api.apify.com/v2";
/** The longest a run may take. Apify's synchronous endpoint waits at most 300 s. */
export const RUN_TIMEOUT_SECS = 240;
/** Shorter runs aren't worth starting: they'd time out with nothing back. */
const MIN_RUN_SECS = 45;
/** Extra time for the HTTP round trip on top of the run itself. */
const NETWORK_SECS = 20;
/** Post URLs per actor run. */
export const URLS_PER_RUN = 50;
/** Runs at once: with each actor's memory (mapping.ts) this fits the free plan's 8 GB. */
const RUNS_AT_ONCE = 4;

export interface ApifyOptions {
  token: string;
  /** Cost cap per actor run (maxTotalChargeUsd). */
  maxChargeUsd: number;
  /** Overrides of the default actor per platform. */
  actors?: Partial<Record<Platform, string>>;
  fetchImpl?: typeof fetch;
}

export class ApifyError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Apify answered ${status}: ${detail}`);
    this.name = "ApifyError";
  }
}

export interface RunOptions {
  token: string;
  maxChargeUsd: number;
  memoryMb: number;
  timeoutSecs: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Runs an actor and returns its dataset items (POST …/run-sync-get-dataset-items). */
export async function runActor(
  actor: string,
  input: Record<string, unknown>,
  {
    token,
    maxChargeUsd,
    memoryMb,
    timeoutSecs,
    fetchImpl = fetch,
    signal,
  }: RunOptions,
): Promise<Record<string, unknown>[]> {
  const url = new URL(
    `${API}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("timeout", String(timeoutSecs));
  url.searchParams.set("memory", String(memoryMb));
  url.searchParams.set("maxTotalChargeUsd", String(maxChargeUsd));
  url.searchParams.set("clean", "true");
  url.searchParams.set("format", "json");
  const timeout = AbortSignal.timeout((timeoutSecs + NETWORK_SECS) * 1000);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      // The token goes in a header, never in the URL, so it stays out of logs.
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok)
    throw new ApifyError(
      response.status,
      (await response.text().catch(() => "")).slice(0, 300),
    );
  const items: unknown = await response.json();
  if (!Array.isArray(items))
    throw new ApifyError(response.status, "not a list");
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

/** A failed run is the provider's fault, never the post's: nothing counts against it. */
function runFailure(error: unknown): FetchOutcome {
  const status = error instanceof ApifyError ? error.status : 0;
  return {
    ok: false,
    error: status === 429 ? "rate_limited" : "provider_error",
    retryable: true,
    detail: error instanceof Error ? error.message.slice(0, 200) : "failed",
  };
}

async function pool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

/**
 * Public post data through Apify's scrapers (no platform accounts needed):
 * one run per platform and 50 posts, all at once, each with a cost cap.
 * Results are matched back by input URL, post ID or canonical link; a post
 * missing from a successful run counts as not found.
 */
export function createApifyProvider(options: ApifyOptions): PostDataProvider {
  return {
    id: "apify",
    // Up to 50 posts per platform in one go, so a batch is one round of runs.
    batchSize: URLS_PER_RUN * RUNS_AT_ONCE,
    concurrency: 1,
    timeoutMs: (RUN_TIMEOUT_SECS + NETWORK_SECS) * 1000,
    minBatchMs: (MIN_RUN_SECS + NETWORK_SECS) * 1000,
    async fetchMany(refs, { signal, deadline }) {
      const outcomes = new Map<string, FetchOutcome>();
      const timeoutSecs = Math.floor(
        Math.min(
          RUN_TIMEOUT_SECS,
          deadline === undefined
            ? RUN_TIMEOUT_SECS
            : (deadline - Date.now()) / 1000 - NETWORK_SECS,
        ),
      );
      if (timeoutSecs < MIN_RUN_SECS) {
        const outcome = runFailure(new Error("No time left for a run"));
        for (const ref of refs) outcomes.set(ref.url, outcome);
        return outcomes;
      }

      const groups = new Map<Platform, PostRef[]>();
      for (const ref of refs)
        groups.set(ref.platform, [...(groups.get(ref.platform) ?? []), ref]);
      const runs: { platform: Platform; refs: PostRef[] }[] = [];
      for (const [platform, group] of groups)
        for (let i = 0; i < group.length; i += URLS_PER_RUN)
          runs.push({ platform, refs: group.slice(i, i + URLS_PER_RUN) });

      await pool(runs, RUNS_AT_ONCE, async ({ platform, refs: batch }) => {
        const spec = ACTORS[platform];
        const inputs = batch.map((ref) => ({ ref, url: spec.inputUrl(ref) }));
        let items: Record<string, unknown>[];
        try {
          items = await runActor(
            options.actors?.[platform] ?? spec.actor,
            spec.input([...new Set(inputs.map((input) => input.url))]),
            {
              token: options.token,
              maxChargeUsd: options.maxChargeUsd,
              memoryMb: spec.memoryMb,
              timeoutSecs,
              fetchImpl: options.fetchImpl,
              signal,
            },
          );
        } catch (error) {
          console.warn(`[apify] ${platform} run failed`, error);
          const outcome = runFailure(error);
          for (const { ref } of inputs) outcomes.set(ref.url, outcome);
          return;
        }

        const mapped = items.map((item) => spec.map(item));
        const found = new Map<string, FetchOutcome>();
        for (const { keys, outcome } of mapped)
          for (const key of keys) {
            const existing = found.get(key);
            // A post found beats an error item for the same key.
            if (!existing || (!existing.ok && outcome.ok))
              found.set(key, outcome);
          }
        for (const { ref, url } of inputs) {
          const outcome =
            refKeys(ref, url)
              .map((key) => found.get(key))
              .find((candidate) => candidate !== undefined) ??
            // One post in and one item out: that item is the post.
            (inputs.length === 1 && mapped.length === 1
              ? mapped[0]!.outcome
              : null);
          outcomes.set(
            ref.url,
            outcome ?? { ok: false, error: "not_found", retryable: false },
          );
        }
      });
      return outcomes;
    },
  };
}
