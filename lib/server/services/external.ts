import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  ExternalContentResponse,
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
import { employees, posts } from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import { loadEveryBoard } from "@/lib/server/services/boards";
import {
  displayName,
  loadEmployeesWithEmails,
} from "@/lib/server/services/employees";
import { toPost } from "@/lib/server/services/mappers";

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

/** What an email username can hold (lowercase). */
const USERNAME = /^[a-z0-9._+-]{1,64}$/;

/**
 * One employee's approved posts, found by their email username: "jdoe" is
 * jdoe@ at the first allowed sign-in domain that has someone.
 */
export async function getExternalContent(
  db: Db,
  username: string,
  domains: readonly string[],
): Promise<ExternalContentResponse> {
  const local = username.trim().toLowerCase();
  const notFound = new HttpError(
    404,
    "not_found",
    "No employee with this username",
  );
  if (!USERNAME.test(local) || domains.length === 0) throw notFound;
  const emails = domains.map((domain) => `${local}@${domain}`);
  const matches = await db
    .select()
    .from(employees)
    .where(inArray(employees.email, emails));
  const employee = emails
    .map((email) => matches.find((row) => row.email === email))
    .find((row) => row !== undefined);
  if (!employee) throw notFound;

  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.employeeId, employee.id), eq(posts.status, "approved")))
    .orderBy(
      sql`${posts.publishedAt} desc nulls last`,
      desc(posts.submittedAt),
    );
  return {
    employee: {
      name: displayName(employee),
      email: employee.email,
      department: employee.department,
    },
    posts: rows.map((row) => {
      const post = toPost(row);
      return {
        url: post.url,
        platform: post.platform,
        category: post.category,
        title: post.title,
        publishedAt: post.publishedAt,
        views: post.views,
        reactions: post.reactions,
        score: post.score,
        thumbnailUrl: post.thumbnailUrl,
      };
    }),
  };
}
