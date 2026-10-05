import "server-only";
import { fixtureFetch } from "@/lib/fixture-post";
import type { PostDataProvider } from "./types";

/**
 * Deterministic fake data derived from a hash of the URL, so the whole
 * pipeline runs without a provider account. Never the default in production.
 */
export function createFixtureProvider(tag: string): PostDataProvider {
  return {
    id: "fixture",
    async fetchMany(refs, { now = new Date() }) {
      return new Map(
        refs.map((ref) => [
          ref.url,
          fixtureFetch(ref, { now, submittedAt: ref.submittedAt, tag }),
        ]),
      );
    },
  };
}
