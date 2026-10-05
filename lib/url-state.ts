import { isPlatform } from "@/lib/platforms";
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type PlatformFilter,
} from "@/lib/api/types";

export const VIEWS = ["leaderboard", "my-posts"] as const;
export type AppView = (typeof VIEWS)[number];

/** Everything shareable lives in the URL: ?view=&metric=&platform=&period=&q= */
export interface AppUrlState {
  view: AppView;
  metric: LeaderboardMetric;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  q: string;
}

export const DEFAULT_URL_STATE: AppUrlState = {
  view: "leaderboard",
  metric: "views",
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

/** Unknown or missing values fall back to defaults, so any URL is safe to open. */
/** Old view names that still open, so shared links keep working. */
const VIEW_ALIASES: Record<string, AppView> = { "my-videos": "my-posts" };

export function parseUrlState(params: ReadableParams): AppUrlState {
  const platform = params.get("platform");
  const view = params.get("view");
  return {
    view: oneOf(
      VIEWS,
      view ? (VIEW_ALIASES[view] ?? view) : null,
      DEFAULT_URL_STATE.view,
    ),
    metric: oneOf(
      LEADERBOARD_METRICS,
      params.get("metric"),
      DEFAULT_URL_STATE.metric,
    ),
    platform: isPlatform(platform) ? platform : DEFAULT_URL_STATE.platform,
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
