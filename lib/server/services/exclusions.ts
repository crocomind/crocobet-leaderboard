import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/server/db/client";
import { leaderboardExclusions } from "@/lib/server/db/schema";

/** The condition for one leaderboard: a round, or the challenge (null). */
export function boardCondition(roundId: string | null) {
  return roundId
    ? eq(leaderboardExclusions.roundId, roundId)
    : isNull(leaderboardExclusions.roundId);
}

/** Employees taken off one leaderboard (a round, or the challenge for null). */
export async function loadExcluded(
  db: Db,
  roundId: string | null,
): Promise<Set<string>> {
  const rows = await db
    .select({ employeeId: leaderboardExclusions.employeeId })
    .from(leaderboardExclusions)
    .where(boardCondition(roundId));
  return new Set(rows.map((row) => row.employeeId));
}

/** Every exclusion, grouped by leaderboard ("" for the challenge). */
export async function loadAllExcluded(
  db: Db,
): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({
      roundId: leaderboardExclusions.roundId,
      employeeId: leaderboardExclusions.employeeId,
    })
    .from(leaderboardExclusions);
  const byBoard = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = row.roundId ?? "";
    const set = byBoard.get(key) ?? new Set<string>();
    set.add(row.employeeId);
    byBoard.set(key, set);
  }
  return byBoard;
}

export async function isExcluded(
  db: Db,
  roundId: string | null,
  employeeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leaderboardExclusions.id })
    .from(leaderboardExclusions)
    .where(
      and(
        boardCondition(roundId),
        eq(leaderboardExclusions.employeeId, employeeId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
