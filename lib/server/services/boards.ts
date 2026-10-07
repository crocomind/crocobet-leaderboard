import "server-only";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type {
  AdminLeaderboardDetail,
  AdminLeaderboardsResponse,
  ContentCategory,
  EmployeeWithEmail,
  ParticipantsResponse,
  ProfileResponse,
} from "@/lib/api/types";
import {
  type BoardDef,
  boardDefs,
  exclusionKey,
  frozenEnd,
  leaderboardInfo,
  participantSummaries,
  profileLeaderboard,
  rankLeaderboard,
} from "@/lib/leaderboards";
import type { RankablePost } from "@/lib/ranking";
import { toRoundsResponse } from "@/lib/rounds";
import type { AuthenticatedEmployee } from "@/lib/server/auth";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  type EmployeeRow,
  employees,
  leaderboardExclusions,
  posts,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import { displayName, loadEmployees } from "@/lib/server/services/employees";
import {
  boardCondition,
  loadAllExcluded,
  loadExcluded,
} from "@/lib/server/services/exclusions";
import { frozenPosts } from "@/lib/server/services/leaderboard";
import { toRankable } from "@/lib/server/services/mappers";
import { loadCampaign, loadRounds } from "@/lib/server/services/rounds";

const NONE: ReadonlySet<string> = new Set();

export const exclusionInputSchema = z.object({ employeeId: z.uuid() }).strict();

/** The challenge and every round, numbered and dated as the API shows them. */
async function loadBoards(db: Db, config: ServerConfig, now: Date) {
  const [{ campaign, source }, rounds] = await Promise.all([
    loadCampaign(db, config),
    loadRounds(db),
  ]);
  const api = toRoundsResponse(rounds, campaign, source);
  return {
    campaign,
    api,
    boards: boardDefs(campaign, rounds, api.rounds, now),
  };
}

function findBoard(boards: readonly BoardDef[], boardId: string): BoardDef {
  const board = boards.find((candidate) => candidate.id === boardId);
  if (!board) throw new HttpError(404, "not_found", "Leaderboard not found");
  return board;
}

/** Approved posts published during the challenge: everything any leaderboard can count. */
async function challengePosts(
  db: Db,
  range: { start: Date; end: Date },
): Promise<RankablePost[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.status, "approved"),
        gte(posts.publishedAt, range.start),
        lt(posts.publishedAt, range.end),
      ),
    );
  return rows.map(toRankable);
}

async function loadEmails(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(inArray(employees.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row.email]));
}

/** Public profiles with emails (admins and the person themselves only). */
async function loadWithEmails(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, EmployeeWithEmail>> {
  const [profiles, emails] = await Promise.all([
    loadEmployees(db, ids),
    loadEmails(db, ids),
  ]);
  return new Map(
    [...profiles].map(([id, profile]) => [
      id,
      { ...profile, email: emails.get(id) ?? "" },
    ]),
  );
}

/** Every leaderboard with its participant counts (admin). */
export async function listLeaderboards(
  db: Db,
  config: ServerConfig,
  now: Date,
): Promise<AdminLeaderboardsResponse> {
  const { campaign, api, boards } = await loadBoards(db, config, now);
  const [rows, excluded] = await Promise.all([
    challengePosts(db, { start: campaign.startsAt, end: campaign.endsAt }),
    loadAllExcluded(db),
  ]);
  return {
    challenge: api.challenge,
    leaderboards: boards.map((board) =>
      leaderboardInfo(
        board,
        rows,
        excluded.get(exclusionKey(board.id) ?? "") ?? NONE,
      ),
    ),
  };
}

/** Everyone who has submitted a post, with their 3-Month Challenge standing (admin). */
export async function listParticipants(
  db: Db,
  config: ServerConfig,
  now: Date,
): Promise<ParticipantsResponse> {
  const { campaign, boards } = await loadBoards(db, config, now);
  const [submissions, rows, excluded] = await Promise.all([
    db
      .select({
        employeeId: posts.employeeId,
        status: posts.status,
        platform: posts.platform,
        submittedAt: posts.submittedAt,
      })
      .from(posts),
    challengePosts(db, { start: campaign.startsAt, end: campaign.endsAt }),
    loadExcluded(db, null),
  ]);
  const people = await loadWithEmails(
    db,
    submissions.map((submission) => submission.employeeId),
  );
  return {
    participants: participantSummaries(
      submissions,
      rows,
      people,
      boards[0]!,
      excluded,
    ),
  };
}

/** One leaderboard's ranked participants and the people taken off it (admin). */
export async function getLeaderboardDetail(
  db: Db,
  config: ServerConfig,
  boardId: string,
  category: ContentCategory,
  now: Date,
): Promise<AdminLeaderboardDetail> {
  const { boards } = await loadBoards(db, config, now);
  const board = findBoard(boards, boardId);
  const actors = alias(employees, "actors");
  const end = frozenEnd(board);
  const [rows, removedRows] = await Promise.all([
    // A finished round's results are frozen at its end.
    end ? frozenPosts(db, board.range, end) : challengePosts(db, board.range),
    db
      .select({
        employeeId: leaderboardExclusions.employeeId,
        createdAt: leaderboardExclusions.createdAt,
        actor: actors,
      })
      .from(leaderboardExclusions)
      .leftJoin(actors, eq(actors.id, leaderboardExclusions.createdBy))
      .where(boardCondition(exclusionKey(board.id)))
      .orderBy(desc(leaderboardExclusions.createdAt)),
  ]);
  const excluded = new Set(removedRows.map((row) => row.employeeId));
  const people = await loadWithEmails(db, [
    ...rows.map((row) => row.employeeId),
    ...excluded,
  ]);
  const ranked = rankLeaderboard(board, category, rows, people, excluded);
  return {
    leaderboard: leaderboardInfo(board, rows, excluded),
    category,
    participants: ranked.entries.map((entry) => ({
      rank: entry.rank,
      employee: entry.employee,
      postCount: entry.postCount,
      totalViews: entry.totalViews,
      totalReactions: entry.totalReactions,
      score: entry.score,
      platforms: entry.platforms,
    })),
    removed: removedRows.flatMap((row) => {
      const employee = people.get(row.employeeId);
      return employee
        ? [
            {
              employee,
              removedAt: row.createdAt.toISOString(),
              removedBy: row.actor
                ? { id: row.actor.id, name: displayName(row.actor) }
                : null,
            },
          ]
        : [];
    }),
  };
}

/** Takes someone off one leaderboard. Doing it twice is harmless. */
export async function removeFromLeaderboard(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  boardId: string,
  employeeId: string,
  now: Date,
): Promise<void> {
  const { boards } = await loadBoards(db, config, now);
  const board = findBoard(boards, boardId);
  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId));
  if (!employee) throw new HttpError(404, "not_found", "Employee not found");
  await db
    .insert(leaderboardExclusions)
    .values({
      roundId: exclusionKey(board.id),
      employeeId,
      createdBy: actor.id,
    })
    .onConflictDoNothing();
}

/** Puts someone back on a leaderboard. Doing it twice is harmless. */
export async function restoreToLeaderboard(
  db: Db,
  config: ServerConfig,
  boardId: string,
  employeeId: string,
  now: Date,
): Promise<void> {
  const { boards } = await loadBoards(db, config, now);
  const board = findBoard(boards, boardId);
  await db
    .delete(leaderboardExclusions)
    .where(
      and(
        boardCondition(exclusionKey(board.id)),
        eq(leaderboardExclusions.employeeId, employeeId),
      ),
    );
}

/**
 * Someone's results on the challenge and on every round that has started.
 * Only the person themselves and admins may see it.
 */
export async function getProfile(
  db: Db,
  config: ServerConfig,
  auth: AuthenticatedEmployee,
  employeeId: string,
  now: Date,
): Promise<ProfileResponse> {
  if (employeeId !== auth.employee.id && !auth.isAdmin)
    throw new HttpError(403, "forbidden", "You can only see your own profile");
  const { campaign, boards } = await loadBoards(db, config, now);
  const [rows, excluded, frozen] = await Promise.all([
    challengePosts(db, { start: campaign.startsAt, end: campaign.endsAt }),
    loadAllExcluded(db),
    // Finished rounds: their posts with the numbers frozen at each round's end.
    Promise.all(
      boards.flatMap((board) => {
        const end = frozenEnd(board);
        return end
          ? [
              frozenPosts(db, board.range, end).then(
                (posts) => [board.id, posts] as const,
              ),
            ]
          : [];
      }),
    ).then((entries) => new Map(entries)),
  ]);
  const people = await loadWithEmails(db, [
    employeeId,
    ...rows.map((row) => row.employeeId),
  ]);
  const employee = people.get(employeeId);
  if (!employee) throw new HttpError(404, "not_found", "Employee not found");
  const result = (board: BoardDef) =>
    profileLeaderboard(
      board,
      employeeId,
      frozen.get(board.id) ?? rows,
      people,
      excluded.get(exclusionKey(board.id) ?? "") ?? NONE,
    );
  const [challenge, ...rounds] = boards;
  return {
    employee,
    timeZone: campaign.timeZone,
    challenge: result(challenge!),
    rounds: rounds
      .filter((board) => board.status !== "upcoming")
      .sort(
        (a, b) =>
          b.range.start.getTime() - a.range.start.getTime() ||
          b.range.end.getTime() - a.range.end.getTime(),
      )
      .map(result),
  };
}
