import type {
  ContentCategory,
  IsoDateTime,
  LeaderboardPeriod,
  LeaderboardStatus,
  Platform,
  PlatformFilter,
  RoundRef,
} from "@/lib/api/types";

/**
 * The external API: read-only leaderboard data for other projects' backends
 * (docs/EXTERNAL_API.md). Its own types, apart from the app's API, so the app
 * can change without breaking the projects that read it.
 */

export interface ExternalEmployee {
  id: string;
  /** Lowercase work email. */
  email: string;
  /** "First Last" in English when known, else the display name. */
  name: string;
  firstName: string | null;
  lastName: string | null;
  /** Empty string when unknown. */
  department: string;
}

export interface ExternalStanding {
  /** 1-based and unique: ties go to more reactions, then the name. */
  rank: number;
  /** Rank on the same board 24 hours ago; null if they weren't ranked then. */
  previousRank: number | null;
  employee: ExternalEmployee;
  /** Approved posts counted on this board. */
  postCount: number;
  /** null on the static board. */
  totalViews: number | null;
  totalReactions: number;
  score: number;
  /** The platforms of the counted posts. */
  platforms: Platform[];
}

export interface ExternalBoard {
  /** "challenge" (the 3-Month Challenge), or the round's id. */
  id: string;
  category: ContentCategory;
  /** "all", or the one platform counted. */
  platform: PlatformFilter;
  /** The board shown: "all" (the challenge) when no round of the asked kind applies. */
  period: LeaderboardPeriod;
  /** The weekly or monthly round shown; null for the challenge. */
  round: RoundRef | null;
  startsAt: IsoDateTime;
  /** Exclusive. */
  endsAt: IsoDateTime;
  status: LeaderboardStatus;
  /** The campaign time zone, e.g. "Asia/Tbilisi". */
  timeZone: string;
}

export interface ExternalStandingsResponse {
  board: ExternalBoard;
  totalParticipants: number;
  /** When metrics were last refreshed; null before the first refresh. */
  lastSyncedAt: IsoDateTime | null;
  /** Everyone ranked, by rank. */
  standings: ExternalStanding[];
}
