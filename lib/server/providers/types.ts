import "server-only";
import type { FetchOutcome, PostRef } from "@/lib/post-data";

export type {
  FetchError,
  FetchedPost,
  FetchOutcome,
  MediaKind,
  PostRef,
} from "@/lib/post-data";

/** Where post metrics come from: pluggable, and selectable per platform. */
export interface PostDataProvider {
  readonly id: string;
  /** Posts per fetchMany call in the sync job (default 25). */
  readonly batchSize?: number;
  /** fetchMany calls at once in the sync job (default 3). */
  readonly concurrency?: number;
  /** The longest a fetchMany call may take (default 60 s in the sync job, 30 s for one post). */
  readonly timeoutMs?: number;
  /** The least time a fetchMany call needs; the sync job won't start one with less time left. */
  readonly minBatchMs?: number;
  /**
   * One outcome per ref, keyed by ref.url. `deadline` (ms since the epoch)
   * is when the sync job has to stop; providers should finish before it.
   */
  fetchMany(
    refs: PostRef[],
    options: { signal: AbortSignal; now?: Date; deadline?: number },
  ): Promise<Map<string, FetchOutcome>>;
}
