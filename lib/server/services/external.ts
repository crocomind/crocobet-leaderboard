import "server-only";
import type { ExternalStandingsResponse } from "@/lib/api/external";
import { CHALLENGE_BOARD_ID } from "@/lib/api/types";
import { statusOf } from "@/lib/leaderboards";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import { loadEmployeesWithEmails } from "@/lib/server/services/employees";
import {
  type BoardQuery,
  rankCurrentBoard,
} from "@/lib/server/services/leaderboard";

/**
 * One board's standings for other projects: the same board, ranks and
 * numbers as the app's leaderboard, with each person's email.
 */
export async function getExternalStandings(
  db: Db,
  config: ServerConfig,
  query: BoardQuery,
  now: Date,
): Promise<ExternalStandingsResponse> {
  const { filter, range, round, board, syncedAt } = await rankCurrentBoard(
    db,
    config,
    query,
    now,
    loadEmployeesWithEmails,
  );
  return {
    board: {
      id: round?.id ?? CHALLENGE_BOARD_ID,
      category: filter.category,
      platform: filter.platform,
      period: range.period,
      round,
      startsAt: range.start.toISOString(),
      endsAt: range.end.toISOString(),
      status: statusOf(range, now),
      timeZone: config.campaign.timeZone,
    },
    totalParticipants: board.totalParticipants,
    lastSyncedAt: syncedAt?.toISOString() ?? null,
    standings: board.entries.map(({ employee, ...entry }) => ({
      rank: entry.rank,
      previousRank: entry.previousRank,
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        firstName: employee.firstName,
        lastName: employee.lastName,
        department: employee.department,
      },
      postCount: entry.postCount,
      totalViews: entry.totalViews,
      totalReactions: entry.totalReactions,
      score: entry.score,
      platforms: entry.platforms,
    })),
  };
}
