import type {
  AdminAction,
  CheckStatus,
  ModerationReason,
} from "@/lib/moderation";
import type { Period } from "@/lib/periods";
import type { ContentCategory, ContentType, Platform } from "@/lib/platforms";
import type { PostStatus } from "@/lib/ranking";
import type { RoundKind } from "@/lib/rounds";

export type {
  AdminAction,
  CheckStatus,
  ContentCategory,
  ContentType,
  ModerationReason,
  Platform,
  PostStatus,
  RoundKind,
};

/** ISO 8601 timestamp, e.g. "2026-10-01T09:30:00.000Z". */
export type IsoDateTime = string;
/** Calendar date, e.g. "2026-09-28". */
export type IsoDate = string;

export const LEADERBOARD_PERIODS = [
  "week",
  "month",
  "all",
] as const satisfies readonly Period[];
/** "all" is the whole 3-month challenge. */
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export type PlatformFilter = Platform | "all";

export const POST_FLAGS = [
  "suspicious_growth",
  "unavailable",
  "metrics_unavailable",
  "tag_removed",
  "author_mismatch",
  "handle_claimed_by_other",
  "category_reclassified",
  "published_date_uncertain",
] as const;
export type PostFlag = (typeof POST_FLAGS)[number];

export type EmployeeRole = "employee" | "admin";

/** Public profile. Leaderboard payloads never include the email. */
export interface Employee {
  id: string;
  /** "First Last" when known, else the display name. */
  name: string;
  firstName: string | null;
  lastName: string | null;
  department: string;
  /** /api/v1/employees/{id}/photo?v={etag}, or null (initials fallback). */
  avatarUrl: string | null;
}

export interface Me extends Employee {
  email: string;
  role: EmployeeRole;
}

export type CheckError =
  "not_found" | "private" | "rate_limited" | "unsupported" | "provider_error";

/** The automated check: evidence for the admin, never an automatic approval. */
export interface PostCheck {
  status: CheckStatus;
  tagFound: boolean | null;
  /** What matched, normalized, e.g. ["#crocobysquad"]. */
  matched: string[];
  authorHandle: string | null;
  ownerMatch: boolean | null;
  publishedInWindow: boolean | null;
  error: CheckError | null;
  checkedAt: IsoDateTime | null;
}

export interface Post {
  id: string;
  employeeId: string;
  /** Canonical link (see analyzePostUrl in lib/platforms.ts). */
  url: string;
  platform: Platform;
  contentType: ContentType;
  category: ContentCategory;
  /** The submitter's title, else the caption's first line (max 120). */
  title: string | null;
  /** When it was published on the platform. Decides which periods it counts in. */
  publishedAt: IsoDateTime | null;
  submittedAt: IsoDateTime;
  status: PostStatus;
  statusReason: ModerationReason | null;
  /** The admin's note, shown to the owner word for word. */
  statusNote: string | null;
  check: PostCheck;
  /** null on static content, or while a video's views are unavailable. */
  views: number | null;
  reactions: number;
  score: number;
  metricsUpdatedAt: IsoDateTime | null;
  thumbnailUrl: string | null;
}

export interface LeaderboardQuery {
  category: ContentCategory;
  /** Only platforms in CATEGORY_PLATFORMS[category]. */
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  /** A weekly or monthly round of that period. null: the current one. */
  round: string | null;
  /** Employee name filter. Empty string means no filter. */
  search: string;
}

/** A weekly or monthly leaderboard round, defined by admins. */
export interface Round {
  id: string;
  kind: RoundKind;
  /** null: show the automatic label ("Week 3", "October"). */
  name: string | null;
  /** 1-based position among the rounds of its kind. */
  number: number;
  startsAt: IsoDateTime;
  /** Exclusive. */
  endsAt: IsoDateTime;
  /** Inclusive calendar dates in the campaign time zone. */
  startDate: IsoDate;
  endDate: IsoDate;
}

export type RoundRef = Pick<Round, "id" | "kind" | "name" | "number">;

export interface ChallengeWindow {
  startsAt: IsoDateTime;
  /** Exclusive. */
  endsAt: IsoDateTime;
  startDate: IsoDate;
  endDate: IsoDate;
  timeZone: string;
  /** "admin": set in the admin panel; "default": from the server settings. */
  source: "admin" | "default";
}

export interface RoundsResponse {
  challenge: ChallengeWindow;
  /** Weekly rounds, then monthly, each by start date. */
  rounds: Round[];
}

export interface RoundInput {
  kind: RoundKind;
  name: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
}

export type RoundPatch = Partial<
  Pick<RoundInput, "name" | "startDate" | "endDate">
>;

export interface ChallengeInput {
  startDate: IsoDate;
  endDate: IsoDate;
}

export type TopPost = Pick<
  Post,
  "id" | "url" | "platform" | "contentType" | "views" | "reactions" | "score"
>;

export interface LeaderboardEntry {
  /** Position on the whole board (before the search filter). */
  rank: number;
  /** Rank on the same board 24 hours ago. null if the employee wasn't ranked then. */
  previousRank: number | null;
  employee: Employee;
  postCount: number;
  /** null on the static board. */
  totalViews: number | null;
  totalReactions: number;
  score: number;
  platforms: Platform[];
  topPost: TopPost;
}

export interface LeaderboardStanding {
  entry: LeaderboardEntry;
  /** Score points to the entry directly above. null for #1. */
  gapToNext: number | null;
}

export interface BoardPeriod {
  start: IsoDateTime;
  /** Exclusive. */
  end: IsoDateTime;
  isCurrent: boolean;
  /** The round shown, or null for a calendar week/month or the whole challenge. */
  round: RoundRef | null;
  /** The campaign time zone the dates are computed in, e.g. "Asia/Tbilisi". */
  timeZone: string;
}

export interface LeaderboardResponse {
  query: LeaderboardQuery;
  period: BoardPeriod;
  /** Sorted by rank. Filtered by `search`; ranks are not renumbered. */
  entries: LeaderboardEntry[];
  /** Ranked employees before the search filter. */
  totalParticipants: number;
  /** The signed-in user's position, even if `search` filters them out. */
  myStanding: LeaderboardStanding | null;
  /** When metrics were last refreshed. null before the first sync. */
  lastSyncedAt: IsoDateTime | null;
}

export interface BoardSummary {
  rank: number | null;
  totalParticipants: number;
  score: number;
  /** null on the static board. */
  totalViews: number | null;
  totalReactions: number;
}

export interface MyPostsResponse {
  /** Newest submission first, every status. */
  posts: Post[];
  summary: {
    postCount: number;
    approvedCount: number;
    pendingCount: number;
    /** The whole challenge ("all"). */
    boards: Record<ContentCategory, BoardSummary>;
  };
}

export interface EmployeePostsQuery {
  category: ContentCategory;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  round: string | null;
}

export interface SubmitPostPayload {
  url: string;
  title?: string;
  /** Fallback publish date, used only if the platform doesn't report one. */
  postedAt?: IsoDate;
}

// ---------------------------------------------------------------- admin

export type EmployeeRef = Pick<Employee, "id" | "name">;

export type MetricsSource = "provider" | "manual";
export type PublishedAtSource = "provider" | "post_id" | "submitter" | "admin";

export interface AdminPost extends Post {
  employee: Employee & { email: string };
  caption: string | null;
  authorName: string | null;
  flags: PostFlag[];
  metricsSource: MetricsSource;
  metricsLocked: boolean;
  publishedAtSource: PublishedAtSource | null;
  reviewedBy: EmployeeRef | null;
  reviewedAt: IsoDateTime | null;
}

export interface MetricSnapshot {
  fetchedAt: IsoDateTime;
  views: number | null;
  reactions: number | null;
  source: MetricsSource;
}

export interface ModerationEvent {
  id: string;
  at: IsoDateTime;
  /** null for the system (sync, checks). */
  actor: EmployeeRef | null;
  action: string;
  reason: ModerationReason | null;
  note: string | null;
}

export interface LinkedHandle {
  platform: Platform;
  handle: string;
  employeeId: string;
}

export interface AdminPostDetail extends AdminPost {
  /** Oldest first. */
  snapshots: MetricSnapshot[];
  /** Newest first. */
  events: ModerationEvent[];
  /** Handles on the post's platform linked to this employee, plus the post author's handle if it's linked to someone else. */
  linkedHandles: LinkedHandle[];
}

/** The queue tabs. "flagged" is pending or approved posts with at least one flag. */
export type AdminQueueTab = PostStatus | "flagged";

export interface AdminPostsQuery {
  status: AdminQueueTab;
  check: CheckStatus | "all";
  flag: PostFlag | "all";
  category: ContentCategory | "all";
  platform: PlatformFilter;
  /** Name, email or handle. */
  q: string;
}

export interface AdminPostsResponse {
  posts: AdminPost[];
  nextCursor: string | null;
  /** Per tab, with the other filters applied. */
  counts: Record<AdminQueueTab, number>;
}

export interface AdminPostPatch {
  views?: number | null;
  reactions?: number;
  metricsLocked?: boolean;
  publishedAt?: IsoDateTime;
  contentType?: ContentType;
  note?: string;
}

export interface ModerationPayload {
  reason?: ModerationReason;
  note?: string;
}

export interface BulkModerationPayload extends ModerationPayload {
  ids: string[];
  action: AdminAction;
}

export interface BulkModerationResult {
  results: { id: string; ok: boolean; error: string | null }[];
}

export type SyncTrigger = "cron" | "manual" | "submit";

export interface SyncRun {
  id: string;
  trigger: SyncTrigger;
  startedAt: IsoDateTime;
  /** null while running. */
  finishedAt: IsoDateTime | null;
  postsTotal: number;
  postsOk: number;
  postsFailed: number;
  error: string | null;
}

export interface SyncStatusResponse {
  /** Newest first. */
  runs: SyncRun[];
}

export interface ExportQuery {
  category: ContentCategory;
  period: Exclude<LeaderboardPeriod, "all"> | "all";
  /** A round of that period. Wins over periodStart. */
  round?: string;
  /** Any date inside the wanted week or month. Ignored for "all". */
  periodStart?: IsoDate;
  /** Standings as of this time (from the snapshots). Default: now. */
  asOf?: IsoDateTime;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/** Every API backend (real HTTP or mock) implements this. */
export interface ApiAdapter {
  getCurrentUser(options?: RequestOptions): Promise<Me>;
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
  withdrawPost(postId: string, options?: RequestOptions): Promise<void>;
  recheckPost(postId: string, options?: RequestOptions): Promise<void>;

  getAdminPosts(
    query: AdminPostsQuery,
    cursor: string | null,
    options?: RequestOptions,
  ): Promise<AdminPostsResponse>;
  getAdminPost(
    postId: string,
    options?: RequestOptions,
  ): Promise<AdminPostDetail>;
  updateAdminPost(
    postId: string,
    patch: AdminPostPatch,
    options?: RequestOptions,
  ): Promise<AdminPostDetail>;
  moderatePost(
    postId: string,
    action: AdminAction,
    payload: ModerationPayload,
    options?: RequestOptions,
  ): Promise<AdminPostDetail>;
  bulkModerate(
    payload: BulkModerationPayload,
    options?: RequestOptions,
  ): Promise<BulkModerationResult>;
  refreshPost(postId: string, options?: RequestOptions): Promise<void>;
  getSyncStatus(options?: RequestOptions): Promise<SyncStatusResponse>;
  startSync(options?: RequestOptions): Promise<SyncRun>;
  exportStandings(query: ExportQuery, options?: RequestOptions): Promise<Blob>;

  getRounds(options?: RequestOptions): Promise<RoundsResponse>;
  createRound(input: RoundInput, options?: RequestOptions): Promise<Round>;
  updateRound(
    roundId: string,
    patch: RoundPatch,
    options?: RequestOptions,
  ): Promise<Round>;
  deleteRound(roundId: string, options?: RequestOptions): Promise<void>;
  /** Creates rounds of that kind for the whole challenge (none may exist yet). */
  generateRounds(
    kind: RoundKind,
    options?: RequestOptions,
  ): Promise<RoundsResponse>;
  updateChallenge(
    input: ChallengeInput,
    options?: RequestOptions,
  ): Promise<ChallengeWindow>;
}
