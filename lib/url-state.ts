import {
  CATEGORY_PLATFORMS,
  CONTENT_CATEGORIES,
  type ContentCategory,
  isPlatform,
} from "@/lib/platforms";
import {
  LEADERBOARD_PERIODS,
  type LeaderboardPeriod,
  type PlatformFilter,
} from "@/lib/api/types";

export const VIEWS = ["leaderboard", "my-posts", "admin"] as const;
export type AppView = (typeof VIEWS)[number];

/** Everything shareable lives in the URL: ?view=&category=&platform=&period=&q= */
export interface AppUrlState {
  view: AppView;
  category: ContentCategory;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  q: string;
}

export const DEFAULT_URL_STATE: AppUrlState = {
  view: "leaderboard",
  category: "video",
  platform: "all",
  period: "month",
  q: "",
};

function oneOf<T extends string>(
  options: readonly T[],
  value: string | null,
  fallback: T,
): T {
  return value !== null && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

interface ReadableParams {
  get(name: string): string | null;
}

/** Old view names that still open, so shared links keep working. */
const VIEW_ALIASES: Record<string, AppView> = { "my-videos": "my-posts" };

/** A platform that isn't on the board (e.g. LinkedIn on Video) falls back to all. */
export function platformForCategory(
  platform: PlatformFilter,
  category: ContentCategory,
): PlatformFilter {
  return platform === "all" || CATEGORY_PLATFORMS[category].includes(platform)
    ? platform
    : "all";
}

/**
 * Unknown or missing values fall back to defaults, so any URL is safe to
 * open. The old `metric` parameter is ignored.
 */
export function parseUrlState(params: ReadableParams): AppUrlState {
  const view = params.get("view");
  const platform = params.get("platform");
  const category = oneOf(
    CONTENT_CATEGORIES,
    params.get("category"),
    DEFAULT_URL_STATE.category,
  );
  return {
    view: oneOf(
      VIEWS,
      view ? (VIEW_ALIASES[view] ?? view) : null,
      DEFAULT_URL_STATE.view,
    ),
    category,
    platform: platformForCategory(
      isPlatform(platform) ? platform : DEFAULT_URL_STATE.platform,
      category,
    ),
    period: oneOf(
      LEADERBOARD_PERIODS,
      params.get("period"),
      DEFAULT_URL_STATE.period,
    ),
    q: (params.get("q") ?? "").slice(0, 100),
  };
}

/** Defaults are left out to keep shared links short. */
export function serializeUrlState(state: AppUrlState): string {
  const params = new URLSearchParams();
  (Object.keys(DEFAULT_URL_STATE) as (keyof AppUrlState)[]).forEach((key) => {
    const value = key === "q" ? state.q.trim() : state[key];
    if (value && value !== DEFAULT_URL_STATE[key]) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}
