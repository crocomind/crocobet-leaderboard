import "server-only";
import type { Platform } from "@/lib/platforms";
import type { ServerConfig } from "@/lib/server/config";
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
  if (id === "fixture")
    return createFixtureProvider(
      `#${config.tags.hashtags[0] ?? "CrocoBySquad"}`,
    );
  if (id === "manual") return manualProvider;
  console.warn(`[providers] unknown provider "${id}"; using manual entry`);
  return manualProvider;
}
