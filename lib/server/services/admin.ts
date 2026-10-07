import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type {
  AdminAction,
  AdminPost,
  AdminPostDetail,
  AdminPostsQuery,
  AdminPostsResponse,
  AdminQueueTab,
  BulkModerationResult,
  ExportQuery,
  ModerationPayload,
  SyncRun,
} from "@/lib/api/types";
import { LEADERBOARD_PERIODS, POST_FLAGS } from "@/lib/api/types";
import {
  ADMIN_ACTIONS,
  applyModeration,
  MODERATION_REASONS,
  type ModerationError,
  NOTE_MAX_LENGTH,
} from "@/lib/moderation";
import { isWithin, postedDateToInstant, zonedToday } from "@/lib/periods";
import { frozenAt } from "@/lib/rounds";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPE_INFO,
  CONTENT_TYPES,
  categoryOf,
  PLATFORM_IDS,
} from "@/lib/platforms";
import { countedPosts, rankBoard } from "@/lib/ranking";
import { standingsCsv, standingsFilename } from "@/lib/standings-csv";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  employeePhotos,
  employees,
  type EmployeeRow,
  moderationEvents,
  postMetricSnapshots,
  posts,
  type PostRow,
  socialAccounts,
  syncRuns,
  type SyncRunRow,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";
import { runCheck } from "@/lib/server/services/checks";
import {
  displayName,
  loadEmployees,
  toEmployee,
} from "@/lib/server/services/employees";
import {
  frozenPosts,
  resolveBoard,
  rowsAsOf,
} from "@/lib/server/services/leaderboard";
import { toPost } from "@/lib/server/services/mappers";
import { claimRun, executeRun } from "@/lib/server/services/sync";

const PAGE_SIZE = 20;
export const MANUAL_SYNC_COOLDOWN_MS = 15 * 60_000;
const BULK_MAX = 100;

// ------------------------------------------------------------- input schemas

const QUEUE_TABS = [
  "pending",
  "approved",
  "rejected",
  "disqualified",
  "flagged",
] as const satisfies readonly AdminQueueTab[];
const CHECK_STATUSES = [
  "queued",
  "running",
  "passed",
  "failed",
  "error",
] as const;

export const adminPostsQuerySchema = z.object({
  status: z.enum(QUEUE_TABS).default("pending"),
  check: z.enum(["all", ...CHECK_STATUSES]).default("all"),
  flag: z.enum(["all", ...POST_FLAGS]).default("all"),
  category: z.enum(["all", ...CONTENT_CATEGORIES]).default("all"),
  platform: z.enum(["all", ...PLATFORM_IDS]).default("all"),
  q: z.string().trim().max(100).default(""),
  cursor: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
});

export const adminPatchSchema = z
  .object({
    views: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    reactions: z.number().int().min(0).max(2_000_000_000).optional(),
    metricsLocked: z.boolean().optional(),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    contentType: z.enum(CONTENT_TYPES).optional(),
    note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  })
  .strict();

export const moderationSchema = z
  .object({
    reason: z.enum(MODERATION_REASONS).optional(),
    note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  })
  .strict();

export const bulkSchema = moderationSchema.extend({
  ids: z.array(z.uuid()).min(1).max(BULK_MAX),
  action: z.enum(ADMIN_ACTIONS),
});

export const exportQuerySchema = z.object({
  category: z.enum(CONTENT_CATEGORIES).default("video"),
  period: z.enum(LEADERBOARD_PERIODS).default("all"),
  round: z.uuid().optional(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  asOf: z.iso.datetime({ offset: true }).optional(),
});

// ------------------------------------------------------------------- queue

const reviewers = alias(employees, "reviewers");

const iso = (date: Date | null) => date?.toISOString() ?? null;

interface QueueRow {
  post: PostRow;
  employee: EmployeeRow;
  etag: string | null;
  reviewer: EmployeeRow | null;
}

function toAdminPost({ post, employee, etag, reviewer }: QueueRow): AdminPost {
  return {
    ...toPost(post),
    employee: { ...toEmployee(employee, etag), email: employee.email },
    caption: post.caption,
    authorName: post.authorName,
    flags: post.flags,
    metricsSource: post.metricsSource,
    metricsLocked: post.metricsLocked,
    publishedAtSource: post.publishedAtSource,
    reviewedBy: reviewer
      ? { id: reviewer.id, name: displayName(reviewer) }
      : null,
    reviewedAt: iso(post.reviewedAt),
  };
}

function selectQueueRows(db: Db) {
  return db
    .select({
      post: posts,
      employee: employees,
      etag: employeePhotos.etag,
      reviewer: reviewers,
    })
    .from(posts)
    .innerJoin(employees, eq(employees.id, posts.employeeId))
    .leftJoin(employeePhotos, eq(employeePhotos.employeeId, posts.employeeId))
    .leftJoin(reviewers, eq(reviewers.id, posts.reviewedBy));
}

const flagged = sql`${posts.status} in ('pending', 'approved') and cardinality(${posts.flags}) > 0`;

function tabCondition(tab: AdminQueueTab): SQL {
  return tab === "flagged" ? flagged : eq(posts.status, tab);
}

/** Every tab lists the most recently submitted posts first. */
const QUEUE_ORDER = [desc(posts.submittedAt), asc(posts.id)];

/** Filters other than the tab: check, flag, category, platform and search. */
function queueFilters(query: AdminPostsQuery): SQL | undefined {
  const q = query.q.trim();
  const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return and(
    query.check === "all" ? undefined : eq(posts.checkStatus, query.check),
    query.flag === "all" ? undefined : sql`${query.flag} = any(${posts.flags})`,
    query.category === "all" ? undefined : eq(posts.category, query.category),
    query.platform === "all" ? undefined : eq(posts.platform, query.platform),
    q
      ? or(
          ilike(employees.displayName, like),
          ilike(
            sql`coalesce(${employees.givenName}, '') || ' ' || coalesce(${employees.familyName}, '')`,
            like,
          ),
          ilike(employees.email, like),
          ilike(posts.authorHandle, like),
          sql`exists (select 1 from ${socialAccounts} where ${socialAccounts.employeeId} = ${posts.employeeId} and ${socialAccounts.handle} ilike ${like})`,
        )
      : undefined,
  );
}

export async function listAdminPosts(
  db: Db,
  query: AdminPostsQuery,
  cursor: string | null,
): Promise<AdminPostsResponse> {
  const offset = Number(cursor ?? 0) || 0;
  const filters = queueFilters(query);
  const count = (condition: SQL) =>
    sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
  const [counts, rows] = await Promise.all([
    db
      .select({
        pending: count(sql`${posts.status} = 'pending'`),
        approved: count(sql`${posts.status} = 'approved'`),
        rejected: count(sql`${posts.status} = 'rejected'`),
        disqualified: count(sql`${posts.status} = 'disqualified'`),
        flagged: count(flagged),
      })
      .from(posts)
      .innerJoin(employees, eq(employees.id, posts.employeeId))
      .where(filters),
    selectQueueRows(db)
      .where(and(tabCondition(query.status), filters))
      .orderBy(...QUEUE_ORDER)
      .limit(PAGE_SIZE + 1)
      .offset(offset),
  ]);
  return {
    posts: rows.slice(0, PAGE_SIZE).map(toAdminPost),
    nextCursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
    counts: counts[0] ?? {
      pending: 0,
      approved: 0,
      rejected: 0,
      disqualified: 0,
      flagged: 0,
    },
  };
}

export async function getAdminPostDetail(
  db: Db,
  postId: string,
): Promise<AdminPostDetail> {
  const [row] = await selectQueueRows(db).where(eq(posts.id, postId));
  if (!row) throw new HttpError(404, "not_found", "Post not found");
  const actors = alias(employees, "actors");
  const authorHandle =
    row.post.authorHandle ?? row.post.checkDetails?.authorHandle ?? null;
  const [snapshots, events, linkedHandles] = await Promise.all([
    db
      .select()
      .from(postMetricSnapshots)
      .where(eq(postMetricSnapshots.postId, postId))
      .orderBy(asc(postMetricSnapshots.fetchedAt)),
    db
      .select({ event: moderationEvents, actor: actors })
      .from(moderationEvents)
      .leftJoin(actors, eq(actors.id, moderationEvents.actorId))
      .where(eq(moderationEvents.postId, postId))
      .orderBy(desc(moderationEvents.createdAt), desc(moderationEvents.id)),
    db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.platform, row.post.platform),
          or(
            eq(socialAccounts.employeeId, row.post.employeeId),
            authorHandle ? eq(socialAccounts.handle, authorHandle) : undefined,
          ),
        ),
      ),
  ]);
  return {
    ...toAdminPost(row),
    snapshots: snapshots.map((snapshot) => ({
      fetchedAt: snapshot.fetchedAt.toISOString(),
      views: snapshot.views,
      reactions: snapshot.reactions,
      source: snapshot.source,
    })),
    events: events.map(({ event, actor }) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      actor: actor ? { id: actor.id, name: displayName(actor) } : null,
      action: event.action,
      reason: event.reason,
      note: event.note,
    })),
    linkedHandles: linkedHandles.map((account) => ({
      platform: account.platform,
      handle: account.handle,
      employeeId: account.employeeId,
    })),
  };
}

// --------------------------------------------------------------- moderation

const MODERATION_ERRORS: Record<
  ModerationError,
  [number, HttpError["code"], string]
> = {
  invalid_transition: [
    409,
    "invalid_transition",
    "That action isn't allowed from this status",
  ],
  forbidden: [403, "forbidden", "Not allowed"],
  reason_required: [422, "validation_error", "A reason is required"],
  note_required: [422, "validation_error", "A note is required"],
  rate_limited: [429, "rate_limited", "Try again in a few minutes"],
};

/** Applies a moderation action through the shared state machine, audited. */
export async function moderatePost(
  db: Db,
  actor: EmployeeRow,
  postId: string,
  action: AdminAction,
  payload: ModerationPayload,
  now: Date,
): Promise<AdminPostDetail> {
  const note = payload.note?.trim() || null;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .for("update");
    if (!row) throw new HttpError(404, "not_found", "Post not found");

    const result = applyModeration({
      status: row.status,
      action,
      actor: "admin",
      reason: payload.reason ?? null,
      note,
      now,
    });
    if (!result.ok) {
      const [status, code, message] = MODERATION_ERRORS[result.error];
      throw new HttpError(status, code, message);
    }
    const next = result.next === "deleted" ? row.status : result.next;
    const approved = next === "approved";
    const changes: Partial<PostRow> = {
      status: next,
      reviewedBy: actor.id,
      reviewedAt: now,
      statusReason:
        next === "rejected" || next === "disqualified"
          ? (payload.reason ?? null)
          : null,
      statusNote:
        next === "rejected" || next === "disqualified" || action === "approve"
          ? note
          : null,
      approvedAt: approved
        ? now
        : next === "disqualified"
          ? row.approvedAt
          : null,
    };
    await tx.update(posts).set(changes).where(eq(posts.id, row.id));

    // The first approved post on a platform links its author to the employee.
    const handle = row.authorHandle ?? row.checkDetails?.authorHandle;
    if (approved && handle)
      await tx
        .insert(socialAccounts)
        .values({
          employeeId: row.employeeId,
          platform: row.platform,
          handle,
          linkedAt: now,
        })
        .onConflictDoNothing();

    await tx.insert(moderationEvents).values({
      postId: row.id,
      actorId: actor.id,
      action:
        action === "approve" && row.checkStatus !== "passed"
          ? "approve_override"
          : action,
      reason: payload.reason ?? null,
      note,
      before: {
        status: row.status,
        statusReason: row.statusReason,
        statusNote: row.statusNote,
      },
      after: {
        status: next,
        statusReason: changes.statusReason,
        statusNote: changes.statusNote,
      },
      createdAt: now,
    });
  });
  return getAdminPostDetail(db, postId);
}

export async function bulkModerate(
  db: Db,
  actor: EmployeeRow,
  payload: z.infer<typeof bulkSchema>,
  now: Date,
): Promise<BulkModerationResult> {
  const results: BulkModerationResult["results"] = [];
  // One post at a time, each with the same rules as the single action.
  for (const id of new Set(payload.ids)) {
    try {
      await moderatePost(
        db,
        actor,
        id,
        payload.action,
        {
          reason: payload.reason,
          note: payload.note,
        },
        now,
      );
      results.push({ id, ok: true, error: null });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof HttpError ? error.code : "unknown",
      });
    }
  }
  return { results };
}

// ------------------------------------------------------------- overrides

/** Manual overrides: numbers (with the lock), publish date and content type. Audited. */
export async function updateAdminPost(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  postId: string,
  patch: z.infer<typeof adminPatchSchema>,
  now: Date,
): Promise<AdminPostDetail> {
  const note = patch.note?.trim() || null;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .for("update");
    if (!row) throw new HttpError(404, "not_found", "Post not found");

    const changes: Partial<PostRow> = {};
    const events: (typeof moderationEvents.$inferInsert)[] = [];
    const audit = (action: string, before: unknown, after: unknown) =>
      events.push({
        postId: row.id,
        actorId: actor.id,
        action,
        note,
        before,
        after,
        createdAt: now,
      });

    let contentType = row.contentType;
    if (patch.contentType && patch.contentType !== row.contentType) {
      if (CONTENT_TYPE_INFO[patch.contentType].platform !== row.platform)
        throw new HttpError(
          422,
          "validation_error",
          "The content type doesn't match the platform",
        );
      contentType = patch.contentType;
      changes.contentType = contentType;
      changes.category = categoryOf(contentType);
      audit(
        "edit_content_type",
        { contentType: row.contentType },
        { contentType },
      );
    }

    const video = categoryOf(contentType) === "video";
    if (patch.views !== undefined && patch.views !== null && !video)
      throw new HttpError(
        422,
        "validation_error",
        "Static posts don't count views",
      );
    const views = patch.views === undefined ? row.views : patch.views;
    const reactions = patch.reactions ?? row.reactions;
    if (views !== row.views || reactions !== row.reactions) {
      Object.assign(changes, {
        views,
        reactions,
        metricsSource: "manual",
        metricsFetchedAt: now,
      } satisfies Partial<PostRow>);
      if (video && views !== null)
        changes.flags = row.flags.filter(
          (flag) => flag !== "metrics_unavailable",
        );
      await tx.insert(postMetricSnapshots).values({
        postId: row.id,
        fetchedAt: now,
        views,
        reactions,
        source: "manual",
      });
      audit(
        "edit_metrics",
        { views: row.views, reactions: row.reactions },
        { views, reactions },
      );
    }

    if (
      patch.metricsLocked !== undefined &&
      patch.metricsLocked !== row.metricsLocked
    ) {
      changes.metricsLocked = patch.metricsLocked;
      audit(
        patch.metricsLocked ? "lock_metrics" : "unlock_metrics",
        { metricsLocked: row.metricsLocked },
        { metricsLocked: patch.metricsLocked },
      );
    }

    if (patch.publishedAt) {
      const publishedAt = new Date(patch.publishedAt);
      if (publishedAt > now)
        throw new HttpError(
          422,
          "validation_error",
          "The publish date can't be in the future",
        );
      if (publishedAt.getTime() !== row.publishedAt?.getTime()) {
        changes.publishedAt = publishedAt;
        changes.publishedAtSource = "admin";
        changes.flags = (changes.flags ?? row.flags).filter(
          (flag) => flag !== "published_date_uncertain",
        );
        changes.checkDetails = row.checkDetails
          ? {
              ...row.checkDetails,
              publishedInWindow: isWithin(publishedAt, {
                start: config.campaign.startsAt,
                end: config.campaign.endsAt,
              }),
            }
          : null;
        audit(
          "edit_published_at",
          { publishedAt: iso(row.publishedAt) },
          { publishedAt: publishedAt.toISOString() },
        );
      }
    }

    if (Object.keys(changes).length > 0)
      await tx.update(posts).set(changes).where(eq(posts.id, row.id));
    if (events.length > 0) await tx.insert(moderationEvents).values(events);
  });
  return getAdminPostDetail(db, postId);
}

/** Removes a post entirely, whatever its status, with its snapshots and audit events. */
export async function deleteAdminPost(db: Db, postId: string): Promise<void> {
  const [deleted] = await db
    .delete(posts)
    .where(eq(posts.id, postId))
    .returning({ id: posts.id });
  if (!deleted) throw new HttpError(404, "not_found", "Post not found");
}

/** Fetches one post again now (any status) and audits it. */
export async function refreshAdminPost(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  postId: string,
  now: Date,
): Promise<void> {
  const row = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!row) throw new HttpError(404, "not_found", "Post not found");
  await runCheck(db, config, postId, { now, logCheck: false });
  await db.insert(moderationEvents).values({
    postId,
    actorId: actor.id,
    action: "refresh",
    createdAt: now,
  });
}

// ------------------------------------------------------------------- sync

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    trigger: row.trigger,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    postsTotal: row.postsTotal,
    postsOk: row.postsOk,
    postsFailed: row.postsFailed,
    error: row.error,
  };
}

export async function getSyncStatus(db: Db): Promise<{ runs: SyncRun[] }> {
  const rows = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(10);
  return { runs: rows.map(toSyncRun) };
}

/**
 * "Refresh now": at most one manual run every 15 minutes. The run is claimed
 * here and does its work after the response. If a run is already going,
 * that one is returned.
 */
export async function startManualSync(
  db: Db,
  config: ServerConfig,
  now: Date,
  defer: (task: () => Promise<unknown>) => void,
): Promise<SyncRun> {
  const [lastManual] = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.trigger, "manual"))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  if (
    lastManual &&
    now.getTime() - lastManual.startedAt.getTime() < MANUAL_SYNC_COOLDOWN_MS
  )
    throw new HttpError(
      429,
      "rate_limited",
      "A sync ran less than 15 minutes ago",
    );

  const runId = await claimRun(db, "manual", now);
  if (runId)
    defer(() =>
      executeRun(db, config, runId, {
        force: true,
        deadline: Date.now() + 270_000,
      }),
    );
  const [run] = runId
    ? await db.select().from(syncRuns).where(eq(syncRuns.id, runId))
    : await db
        .select()
        .from(syncRuns)
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);
  if (!run) throw new HttpError(503, "service_unavailable", "No sync run");
  return toSyncRun(run);
}

// ----------------------------------------------------------------- export

/** Standings for any week or month (or the whole challenge), as they stood at `asOf`. */
export async function exportStandings(
  db: Db,
  config: ServerConfig,
  query: ExportQuery,
  now: Date,
): Promise<{ filename: string; csv: string }> {
  const { timeZone } = config.campaign;
  const reference =
    query.period !== "all" && query.periodStart
      ? (postedDateToInstant(query.periodStart, timeZone) ?? now)
      : now;
  const { filter, range: shown } = await resolveBoard(
    db,
    config,
    {
      category: query.category,
      platform: "all",
      period: query.period,
      round: query.round ?? null,
    },
    reference,
    now,
  );
  const range = filter.range;
  const asOf = query.asOf ? new Date(query.asOf) : now;
  // After a round ends, its standings are the frozen ones.
  const end = frozenAt(shown, now);
  const rows =
    end && asOf >= end
      ? await frozenPosts(db, range, end)
      : await rowsAsOf(db, filter, asOf);
  const ids = [...new Set(rows.map((row) => row.employeeId))];
  const [profiles, emails] = await Promise.all([
    loadEmployees(db, ids),
    ids.length
      ? db
          .select({ id: employees.id, email: employees.email })
          .from(employees)
          .where(inArray(employees.id, ids))
      : Promise.resolve([]),
  ]);
  const emailOf = new Map(emails.map((row) => [row.id, row.email]));
  const board = rankBoard(rows, profiles, filter);
  return {
    filename: standingsFilename(
      query.category,
      shown.period,
      zonedToday(range.start, timeZone),
    ),
    csv: standingsCsv(
      board.entries.map((entry) => ({
        rank: entry.rank,
        name: entry.employee.name,
        email: emailOf.get(entry.employee.id) ?? "",
        department: entry.employee.department,
        posts: entry.postCount,
        views: entry.totalViews,
        reactions: entry.totalReactions,
        score: entry.score,
        urls: countedPosts(rows, entry.employee.id, filter).map(
          (post) => post.url,
        ),
      })),
    ),
  };
}
