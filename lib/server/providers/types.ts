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
  /** One outcome per ref, keyed by ref.url. */
  fetchMany(
    refs: PostRef[],
    options: { signal: AbortSignal; now?: Date },
  ): Promise<Map<string, FetchOutcome>>;
}
