import "server-only";
import type { Platform } from "@/lib/platforms";
import type { ServerConfig } from "@/lib/server/config";
import { createApifyProvider } from "./apify";
import { createFixtureProvider } from "./fixture";
import { manualProvider } from "./manual";
import type { PostDataProvider } from "./types";

export type { PostDataProvider } from "./types";

/**
 * The provider for a platform: POST_DATA_PROVIDER_<PLATFORM>, else
 * POST_DATA_PROVIDER. Unknown ids fall back to manual entry, with a warning.
 */
export function providerFor(
  platform: Platform,
  config: ServerConfig,
): PostDataProvider {
  const id = config.providers[platform];
  if (id === "fixture") return createFixtureProvider(config.tags);
  if (id === "manual") return manualProvider;
  if (id === "apify") {
    if (config.apify.token)
      return createApifyProvider({
        token: config.apify.token,
        maxChargeUsd: config.apify.maxChargeUsd,
        actors: config.apify.actors,
      });
    console.warn("[providers] APIFY_API_TOKEN is not set; using manual entry");
    return manualProvider;
  }
  console.warn(`[providers] unknown provider "${id}"; using manual entry`);
  return manualProvider;
}
