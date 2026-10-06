import "server-only";
import { and, count, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import type {
  EmployeePostsQuery,
  MyPostsResponse,
  Post,
  SubmitPostPayload,
} from "@/lib/api/types";
import { applyModeration } from "@/lib/moderation";
import {
  postedDateToInstant,
  submissionsOpen,
  zonedToday,
} from "@/lib/periods";
import { analyzePostUrl, type PostUrlAnalysis } from "@/lib/platforms";
import { countedPosts } from "@/lib/ranking";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  employeePhotos,
  type EmployeeRow,
  moderationEvents,
  posts,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import { resolveShortLink } from "@/lib/server/link-resolver";
import { runCheck } from "@/lib/server/services/checks";
import { boardSummary, resolveBoard } from "@/lib/server/services/leaderboard";
import { toPost, toRankable } from "@/lib/server/services/mappers";
import { TITLE_MAX_LENGTH } from "@/lib/validation/submit-post";

export const SUBMISSIONS_PER_DAY = 20;
export const DAY_MS = 86_400_000;

export interface ServiceContext {
  db: Db;
  config: ServerConfig;
  now: Date;
  /** Runs work after the response is sent (Next's after(); collected in tests). */
  defer: (task: () => Promise<unknown>) => void;
  /** The time when deferred work runs. */
  clock: () => Date;
}

export const submitPostSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(TITLE_MAX_LENGTH).optional(),
  postedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function getMyPosts(
  { db, config, now }: Pick<ServiceContext, "db" | "config" | "now">,
  employee: EmployeeRow,
): Promise<MyPostsResponse> {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.employeeId, employee.id))
    .orderBy(desc(posts.submittedAt));
  const [video, staticBoard] = await Promise.all([
    boardSummary(db, config, "video", employee.id, now),
    boardSummary(db, config, "static", employee.id, now),
  ]);
  return {
    posts: rows.map(toPost),
    summary: {
      postCount: rows.length,
      approvedCount: rows.filter((row) => row.status === "approved").length,
      pendingCount: rows.filter((row) => row.status === "pending").length,
      boards: { video, static: staticBoard },
    },
  };
}

/** The posts counted in one employee's entry, highest score first. */
export async function getEmployeePosts(
  { db, config, now }: Pick<ServiceContext, "db" | "config" | "now">,
  employeeId: string,
  query: EmployeePostsQuery,
): Promise<Post[]> {
  const { filter } = await resolveBoard(db, config, query, now);
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.employeeId, employeeId), eq(posts.status, "approved")));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return countedPosts(rows.map(toRankable), employeeId, filter).map((post) =>
    toPost(byId.get(post.id)!),
  );
}

/**
 * Short links are resolved first (5 seconds at most, with the SSRF guard).
 * If that fails, the post is accepted as is and deduplicated during the
 * check, once the provider reports the real link.
 */
async function analyzeSubmission(
  url: string,
  resolveLink: typeof resolveShortLink,
): Promise<PostUrlAnalysis> {
  const analysis = analyzePostUrl(url);
  if (analysis.status !== "valid" || !analysis.needsResolution) return analysis;
  const resolved = await resolveLink(analysis.normalizedUrl, analysis.platform);
  if (!resolved.ok) return analysis;
  const target = analyzePostUrl(resolved.url);
  if (target.status === "unsupported-content") return target;
  return target.status === "valid" &&
    !target.needsResolution &&
    target.platform === analysis.platform
    ? target
    : analysis;
}

export async function submitPost(
  { db, config, now, defer, clock }: ServiceContext,
  employee: EmployeeRow,
  payload: SubmitPostPayload,
  {
    resolveLink = resolveShortLink,
  }: { resolveLink?: typeof resolveShortLink } = {},
): Promise<Post> {
  const analysis = await analyzeSubmission(payload.url, resolveLink);
  if (analysis.status === "unsupported-platform")
    throw new HttpError(422, "unsupported_platform", "Unsupported platform");
  if (analysis.status === "unsupported-content")
    throw new HttpError(
      422,
      "unsupported_content",
      "Stories, profiles, feeds and TikTok photo posts don't count",
    );
  if (analysis.status !== "valid")
    throw new HttpError(422, "invalid_url", "Not a link to a post");

  if (!submissionsOpen(now, config.campaign, config.submissionGraceDays))
    throw new HttpError(403, "challenge_closed", "Submissions are closed");

  const postedAt = payload.postedAt ?? null;
  if (
    postedAt &&
    (!postedDateToInstant(postedAt, config.campaign.timeZone) ||
      postedAt > zonedToday(now, config.campaign.timeZone))
  )
    throw new HttpError(422, "validation_error", "Invalid posted date");

  const [recent] = await db
    .select({ total: count() })
    .from(posts)
    .where(
      and(
        eq(posts.employeeId, employee.id),
        gt(posts.submittedAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  if ((recent?.total ?? 0) >= SUBMISSIONS_PER_DAY)
    throw new HttpError(429, "rate_limited", "Too many submissions today");

  const duplicate = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      or(
        eq(posts.urlCanonical, analysis.normalizedUrl),
        analysis.externalId
          ? and(
              eq(posts.platform, analysis.platform),
              eq(posts.externalId, analysis.externalId),
            )
          : undefined,
      ),
    )
    .limit(1);
  if (duplicate.length > 0)
    throw new HttpError(
      409,
      "duplicate_post",
      "This post has already been submitted",
    );

  // The unique keys catch a duplicate submitted at the same moment.
  const [row] = await db
    .insert(posts)
    .values({
      employeeId: employee.id,
      platform: analysis.platform,
      contentType: analysis.contentType,
      category: analysis.category,
      urlSubmitted: payload.url,
      urlCanonical: analysis.normalizedUrl,
      externalId: analysis.externalId,
      title: payload.title?.trim() || null,
      submittedPostedAt: postedAt,
      submittedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!row)
    throw new HttpError(
      409,
      "duplicate_post",
      "This post has already been submitted",
    );

  await db.insert(moderationEvents).values({
    postId: row.id,
    actorId: employee.id,
    action: "submitted",
    createdAt: now,
  });
  defer(() => runCheck(db, config, row.id, { now: clock() }));
  return toPost(row);
}

async function findPost(db: Db, postId: string) {
  const row = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!row) throw new HttpError(404, "not_found", "Post not found");
  return row;
}

/** The owner takes back a pending post. */
export async function withdrawPost(
  db: Db,
  employee: EmployeeRow,
  postId: string,
): Promise<void> {
  const row = await findPost(db, postId);
  if (row.employeeId !== employee.id)
    throw new HttpError(404, "not_found", "Post not found");
  const result = applyModeration({
    status: row.status,
    action: "withdraw",
    actor: "owner",
  });
  if (!result.ok)
    throw new HttpError(
      409,
      "invalid_transition",
      "Only pending posts can be withdrawn",
    );
  await db.delete(posts).where(eq(posts.id, row.id));
}

/** Runs the check again: the owner at most every 10 minutes, admins any time. */
export async function recheckPost(
  { db, config, now, defer, clock }: ServiceContext,
  employee: EmployeeRow,
  isAdmin: boolean,
  postId: string,
): Promise<void> {
  const row = await findPost(db, postId);
  const owner = row.employeeId === employee.id;
  if (!owner && !isAdmin)
    throw new HttpError(404, "not_found", "Post not found");
  const result = applyModeration({
    status: row.status,
    action: "recheck",
    actor: owner ? "owner" : "admin",
    lastRecheckAt: row.lastRecheckAt,
    now,
  });
  if (!result.ok) {
    if (result.error === "rate_limited")
      throw new HttpError(429, "rate_limited", "Try again in a few minutes");
    throw new HttpError(
      409,
      "invalid_transition",
      "Only pending posts can be re-checked",
    );
  }
  await db
    .update(posts)
    .set({
      checkStatus: "running",
      ...(owner ? { lastRecheckAt: now } : {}),
    })
    .where(eq(posts.id, row.id));
  await db.insert(moderationEvents).values({
    postId: row.id,
    actorId: employee.id,
    action: "recheck",
    createdAt: now,
  });
  defer(() => runCheck(db, config, row.id, { now: clock() }));
}

export async function getPhoto(db: Db, employeeId: string) {
  const [photo] = await db
    .select()
    .from(employeePhotos)
    .where(eq(employeePhotos.employeeId, employeeId));
  return photo ?? null;
}
