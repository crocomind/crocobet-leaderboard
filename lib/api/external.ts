import type { IsoDate } from "@/lib/api/types";

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
