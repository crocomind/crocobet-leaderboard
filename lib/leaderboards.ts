import {
  type BoardResult,
  CHALLENGE_BOARD_ID,
  type ContentCategory,
  type EmployeeWithEmail,
  type LeaderboardInfo,
  type LeaderboardStatus,
  type ParticipantSummary,
  type Platform,
  type PostStatus,
  type ProfileLeaderboard,
  type Round,
} from "@/lib/api/types";
import type { CampaignWindow } from "@/lib/periods";
import { CONTENT_CATEGORIES, PLATFORM_IDS } from "@/lib/platforms";
import {
  type BoardFilter,
  countsOnBoard,
  type RankableEmployee,
  type RankablePost,
  type RankedEntry,
  rankBoard,
} from "@/lib/ranking";
import { roundBoardRange, type RoundRange } from "@/lib/rounds";

/**
 * The leaderboards admins manage and people's history on them: the 3-Month
 * Challenge plus every weekly and monthly round. Pure, so the server and the
 * mock API compute them the same way.
 */

export interface BoardDef {
  /** CHALLENGE_BOARD_ID, or the round's id. */
  id: string;
  /** The round as the API shows it (numbered, with dates); null for the challenge. */
  round: Round | null;
  range: { start: Date; end: Date };
  status: LeaderboardStatus;
}

/** When a finished round's results froze (its end); null for running ones and the challenge. */
export function frozenEnd(board: BoardDef): Date | null {
  return board.round && board.status === "finished" ? board.range.end : null;
}

/** The key exclusions are stored under: the round id, or null for the challenge. */
export function exclusionKey(boardId: string): string | null {
  return boardId === CHALLENGE_BOARD_ID ? null : boardId;
}

function statusOf(
  range: { start: Date; end: Date },
  now: Date,
): LeaderboardStatus {
  if (now < range.start) return "upcoming";
  return now < range.end ? "running" : "finished";
}

/**
 * Every leaderboard: the challenge, then the rounds in the order the API
 * lists them (weekly, then monthly, each by start).
 */
export function boardDefs(
  campaign: CampaignWindow,
  rounds: readonly RoundRange[],
  apiRounds: readonly Round[],
  now: Date,
): BoardDef[] {
  const challenge = { start: campaign.startsAt, end: campaign.endsAt };
  const byId = new Map(rounds.map((round) => [round.id, round]));
  return [
    {
      id: CHALLENGE_BOARD_ID,
      round: null,
      range: challenge,
      status: statusOf(challenge, now),
    },
    ...apiRounds.flatMap((apiRound) => {
      const round = byId.get(apiRound.id);
      if (!round) return [];
      const { start, end } = roundBoardRange(round, campaign, now);
      return [
        {
          id: round.id,
          round: apiRound,
          range: { start, end },
          status: statusOf({ start, end }, now),
        },
      ];
    }),
  ];
}

function filterFor(
  board: BoardDef,
  category: ContentCategory,
  excluded: ReadonlySet<string>,
): BoardFilter {
  return { category, platform: "all", range: board.range, excluded };
}

/** A leaderboard with its participant counts. */
export function leaderboardInfo(
  board: BoardDef,
  posts: readonly RankablePost[],
  excluded: ReadonlySet<string>,
): LeaderboardInfo {
  const participants = Object.fromEntries(
    CONTENT_CATEGORIES.map((category) => {
      const filter = filterFor(board, category, excluded);
      const people = new Set(
        posts
          .filter((post) => countsOnBoard(post, filter))
          .map((post) => post.employeeId),
      );
      return [category, people.size];
    }),
  ) as Record<ContentCategory, number>;
  return {
    id: board.id,
    round: board.round,
    startsAt: board.range.start.toISOString(),
    endsAt: board.range.end.toISOString(),
    status: board.status,
    participants,
    removedCount: excluded.size,
  };
}

/** The ranked board of one category, without the removed. */
export function rankLeaderboard<E extends RankableEmployee>(
  board: BoardDef,
  category: ContentCategory,
  posts: readonly RankablePost[],
  employees: ReadonlyMap<string, E>,
  excluded: ReadonlySet<string>,
  meId?: string,
) {
  return rankBoard(posts, employees, filterFor(board, category, excluded), {
    meId: meId ?? null,
  });
}

/** Someone's result on a ranked board; an unranked person gets zeros. */
function boardResult(
  category: ContentCategory,
  entry: RankedEntry<RankableEmployee> | undefined,
  totalParticipants: number,
): BoardResult {
  return {
    rank: entry?.rank ?? null,
    totalParticipants,
    score: entry?.score ?? 0,
    postCount: entry?.postCount ?? 0,
    totalViews: category === "video" ? (entry?.totalViews ?? 0) : null,
    totalReactions: entry?.totalReactions ?? 0,
  };
}

/** One person's results on a leaderboard (both categories). */
export function profileLeaderboard<E extends RankableEmployee>(
  board: BoardDef,
  employeeId: string,
  posts: readonly RankablePost[],
  employees: ReadonlyMap<string, E>,
  excluded: ReadonlySet<string>,
): ProfileLeaderboard {
  const results = Object.fromEntries(
    CONTENT_CATEGORIES.map((category): [ContentCategory, BoardResult] => {
      const ranked = rankLeaderboard(
        board,
        category,
        posts,
        employees,
        excluded,
        employeeId,
      );
      return [
        category,
        boardResult(
          category,
          ranked.myStanding?.entry,
          ranked.totalParticipants,
        ),
      ];
    }),
  ) as Record<ContentCategory, BoardResult>;
  return {
    id: board.id,
    round: board.round,
    startsAt: board.range.start.toISOString(),
    endsAt: board.range.end.toISOString(),
    status: board.status === "finished" ? "finished" : "running",
    removed: excluded.has(employeeId),
    results,
  };
}

/** What the participants list needs from each submitted post (any status). */
export interface Submission {
  employeeId: string;
  status: PostStatus;
  platform: Platform;
  submittedAt: Date;
}

/**
 * Everyone who has submitted a post: their post counts, platforms, last
 * submission and 3-Month Challenge standing. Most recent submission first.
 */
export function participantSummaries(
  submissions: readonly Submission[],
  posts: readonly RankablePost[],
  people: ReadonlyMap<string, EmployeeWithEmail>,
  challenge: BoardDef,
  excluded: ReadonlySet<string>,
): ParticipantSummary[] {
  const boards = CONTENT_CATEGORIES.map((category) => {
    const ranked = rankLeaderboard(
      challenge,
      category,
      posts,
      people,
      excluded,
    );
    return {
      category,
      total: ranked.totalParticipants,
      byEmployee: new Map(
        ranked.entries.map((entry) => [entry.employee.id, entry]),
      ),
    };
  });
  const byEmployee = new Map<string, Submission[]>();
  for (const submission of submissions) {
    const list = byEmployee.get(submission.employeeId) ?? [];
    list.push(submission);
    byEmployee.set(submission.employeeId, list);
  }
  return [...byEmployee]
    .flatMap(([employeeId, list]) => {
      const employee = people.get(employeeId);
      if (!employee) return [];
      const count = (status: PostStatus) =>
        list.filter((submission) => submission.status === status).length;
      const used = new Set(list.map((submission) => submission.platform));
      const last = Math.max(
        ...list.map((submission) => submission.submittedAt.getTime()),
      );
      return [
        {
          employee,
          posts: {
            total: list.length,
            approved: count("approved"),
            pending: count("pending"),
            rejected: count("rejected"),
            disqualified: count("disqualified"),
          },
          platforms: PLATFORM_IDS.filter((platform) => used.has(platform)),
          challenge: Object.fromEntries(
            boards.map(({ category, total, byEmployee: entries }) => [
              category,
              boardResult(category, entries.get(employeeId), total),
            ]),
          ) as Record<ContentCategory, BoardResult>,
          removedFromChallenge: excluded.has(employeeId),
          lastSubmittedAt: new Date(last).toISOString(),
        },
      ];
    })
    .sort(
      (a, b) => Date.parse(b.lastSubmittedAt) - Date.parse(a.lastSubmittedAt),
    );
}
