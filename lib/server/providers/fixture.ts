import "server-only";
import type { CampaignTagConfig } from "@/lib/campaign-tag";
import { fixtureFetch } from "@/lib/fixture-post";
import type { PostDataProvider } from "./types";

/**
 * Deterministic fake data derived from a hash of the URL, so the whole
 * pipeline runs without a provider account. Never the default in production.
 */
export function createFixtureProvider(
  tags: CampaignTagConfig,
): PostDataProvider {
  return {
    id: "fixture",
    async fetchMany(refs, { now = new Date() }) {
      return new Map(
        refs.map((ref) => [
          ref.url,
          fixtureFetch(ref, { now, submittedAt: ref.submittedAt, tags }),
        ]),
      );
    },
  };
}
