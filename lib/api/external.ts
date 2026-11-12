import type {
  ContentCategory,
  IsoDate,
  IsoDateTime,
  Platform,
} from "@/lib/api/types";

/**
 * The external API: read-only leaderboard results for other projects'
 * backends (docs/EXTERNAL_API.md). Its own types, apart from the app's API,
 * so the app can change without breaking the projects that read it.
 */

/** "challenge" is the 3-Month Challenge; the others are admin-set rounds. */
export type ExternalLeaderboardType = "challenge" | "week" | "month";

export interface ExternalParticipant {
  /** 1-based and unique: ties go to more reactions, then the name. */
  rank: number;
  /** "First Last" in English when known, else the display name. */
  name: string;
  /** Lowercase work email. */
  email: string;
  /** Empty string when unknown. */
  department: string;
  score: number;
  /** null on the static board. */
  views: number | null;
  reactions: number;
  /** Approved posts counted on this board. */
  posts: number;
}

export interface ExternalLeaderboard {
  type: ExternalLeaderboardType;
  /** The admin's name for a round, else "Week 3", "October" or "3-Month Challenge". */
  name: string;
  /** Inclusive calendar dates in the campaign time zone (Asia/Tbilisi). */
  startDate: IsoDate;
  endDate: IsoDate;
  status: "running" | "finished";
  /** By rank. Score: views + reactions. */
  video: ExternalParticipant[];
  /** By rank. Score: reactions. */
  static: ExternalParticipant[];
}

export interface ExternalLeaderboardsResponse {
  /** The challenge, then weekly rounds, then monthly, each by start. Upcoming rounds aren't listed. */
  leaderboards: ExternalLeaderboard[];
}

export interface ExternalContentPost {
  /** The post's canonical link. */
  url: string;
  platform: Platform;
  /** "video" (scored views + reactions) or "static" (scored reactions). */
  category: ContentCategory;
  /** The submitter's title, else the caption's first line; null if neither. */
  title: string | null;
  /** When it was published on the platform. */
  publishedAt: IsoDateTime | null;
  /** Latest views; null on static posts, or while a video's views are hidden. */
  views: number | null;
  reactions: number;
  score: number;
  /** From the platform's CDN; may expire. null when unknown. */
  thumbnailUrl: string | null;
}

export interface ExternalContentResponse {
  employee: {
    /** "First Last" in English when known, else the display name. */
    name: string;
    email: string;
    /** Empty string when unknown. */
    department: string;
  };
  /** Every approved post, newest published first. */
  posts: ExternalContentPost[];
}
