import "server-only";
import type {
  ExternalLeaderboard,
  ExternalLeaderboardsResponse,
  ExternalParticipant,
} from "@/lib/api/external";
import type { ContentCategory, EmployeeWithEmail } from "@/lib/api/types";
import { type BoardDef, rankLeaderboard } from "@/lib/leaderboards";
import type { RankablePost } from "@/lib/ranking";
import { rangeDates } from "@/lib/rounds";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import { loadEveryBoard } from "@/lib/server/services/boards";
import { loadEmployeesWithEmails } from "@/lib/server/services/employees";

/** The name the app shows: the admin's, else "Week 3" or the month ("October"). */
function boardName(board: BoardDef, timeZone: string): string {
  const { round } = board;
  if (!round) return "3-Month Challenge";
  if (round.name) return round.name;
  if (round.kind === "week") return `Week ${round.number}`;
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone }).format(
    new Date(round.startsAt),
  );
}

/**
 * Every leaderboard that has started (the 3-Month Challenge and each weekly
 * and monthly round), with everyone ranked on its video and static boards.
 * The same ranks and numbers as the app: finished rounds frozen at their
 * end, people an admin took off a leaderboard left out of it.
 */
export async function getExternalLeaderboards(
  db: Db,
  config: ServerConfig,
  now: Date,
): Promise<ExternalLeaderboardsResponse> {
  const { campaign, boards, postsOn, removedFrom } = await loadEveryBoard(
    db,
    config,
    now,
  );
  const started = boards.filter((board) => board.status !== "upcoming");
  const people = await loadEmployeesWithEmails(
    db,
    started.flatMap((board) => postsOn(board).map((post) => post.employeeId)),
  );

  const ranked = (
    board: BoardDef,
    posts: readonly RankablePost[],
    category: ContentCategory,
  ): ExternalParticipant[] =>
    rankLeaderboard<EmployeeWithEmail>(
      board,
      category,
      posts,
      people,
      removedFrom(board),
    ).entries.map((entry) => ({
      rank: entry.rank,
      name: entry.employee.name,
      email: entry.employee.email,
      department: entry.employee.department,
      score: entry.score,
      views: entry.totalViews,
      reactions: entry.totalReactions,
      posts: entry.postCount,
    }));

  return {
    leaderboards: started.map((board): ExternalLeaderboard => {
      const posts = postsOn(board);
      return {
        type: board.round?.kind ?? "challenge",
        name: boardName(board, campaign.timeZone),
        ...rangeDates(board.range.start, board.range.end, campaign.timeZone),
        status: board.status === "finished" ? "finished" : "running",
        video: ranked(board, posts, "video"),
        static: ranked(board, posts, "static"),
      };
    }),
  };
}
