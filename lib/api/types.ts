import type { Platform } from "@/lib/platforms";

export type { Platform };

/** ISO 8601 timestamp, e.g. "2026-10-01T09:30:00.000Z". */
export type IsoDateTime = string;
/** Calendar date, e.g. "2026-09-28". */
export type IsoDate = string;

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  avatarUrl: string | null;
}

export type PostStatus = "pending" | "verified" | "rejected";

export interface Post {
  id: string;
  employeeId: string;
  /** Normalized link (see analyzePostUrl in lib/platforms.ts). */
  url: string;
  platform: Platform;
  title: string | null;
  postedAt: IsoDate | null;
  submittedAt: IsoDateTime;
  status: PostStatus;
  /** Set only when status is "rejected". */
  rejectionReason: string | null;
  /** 0 until the post is verified and its stats are synced. */
  views: number;
  reactions: number;
  thumbnailUrl: string | null;
}

export const LEADERBOARD_METRICS = ["views", "reactions", "score"] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const LEADERBOARD_PERIODS = ["week", "month", "all"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export type PlatformFilter = Platform | "all";

export interface LeaderboardQuery {
  metric: LeaderboardMetric;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  /** Employee name filter. Empty string means no filter. */
  search: string;
}

export interface LeaderboardEntry {
  /** Position in the full ranking for the query's metric, platform and period. */
  rank: number;
  /** Rank in the previous period. null if the employee wasn't ranked then. */
  previousRank: number | null;
  employee: Employee;
  postCount: number;
  totalViews: number;
  totalReactions: number;
  /** Combined score. The backend owns the formula. */
  score: number;
}

export interface LeaderboardStanding {
  entry: LeaderboardEntry;
  /**
   * How much of the selected metric the user needs to reach the next rank up.
   * null when the user is #1.
   */
  gapToNext: number | null;
}

export interface LeaderboardResponse {
  query: LeaderboardQuery;
  /** Sorted by rank. Filtered by `search`; ranks are not renumbered. */
  entries: LeaderboardEntry[];
  /** Ranked employees before the search filter. */
  totalParticipants: number;
  /** The signed-in user's position, even if `search` filters them out. */
  myStanding: LeaderboardStanding | null;
  /** When stats were last synced from the platforms. */
  lastSyncedAt: IsoDateTime;
}

export interface MyPostsSummary {
  totalViews: number;
  totalReactions: number;
  postCount: number;
  /** All-time rank by combined score. null if not ranked yet. */
  rank: number | null;
  totalParticipants: number;
}

export interface MyPostsResponse {
  /** Newest submission first. */
  posts: Post[];
  summary: MyPostsSummary;
}

export interface EmployeePostsQuery {
  platform: PlatformFilter;
  period: LeaderboardPeriod;
}

export interface SubmitPostPayload {
  url: string;
  platform: Platform;
  title?: string;
  postedAt?: IsoDate;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/** Every API backend (real HTTP or mock) implements this. */
export interface ApiAdapter {
  getLeaderboard(
    query: LeaderboardQuery,
    options?: RequestOptions,
  ): Promise<LeaderboardResponse>;
  getMyPosts(options?: RequestOptions): Promise<MyPostsResponse>;
  getEmployeePosts(
    employeeId: string,
    query: EmployeePostsQuery,
    options?: RequestOptions,
  ): Promise<Post[]>;
  submitPost(
    payload: SubmitPostPayload,
    options?: RequestOptions,
  ): Promise<Post>;
  getCurrentUser(options?: RequestOptions): Promise<Employee>;
}
