import "server-only";
import type { PostDataProvider } from "./types";

/** No automatic data: every number comes from an admin. */
export const manualProvider: PostDataProvider = {
  id: "manual",
  async fetchMany(refs) {
    return new Map(
      refs.map((ref) => [
        ref.url,
        { ok: false, error: "unsupported", retryable: false } as const,
      ]),
    );
  },
};
