import "server-only";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CheckStatus,
  EmployeeRole,
  MetricsSource,
  ModerationReason,
  PostCheck,
  PostFlag,
  PostStatus,
  PublishedAtSource,
  SyncTrigger,
} from "@/lib/api/types";
import type { ContentCategory, ContentType, Platform } from "@/lib/platforms";

/**
 * Supabase Postgres, accessed only by the server (Drizzle over the
 * transaction pooler). Row-level security is on for every table with no
 * policies, so the public PostgREST API can't read or write anything.
 */

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

const createdAt = () => timestamptz("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Entra object ID: the stable key for an employee. */
    entraOid: text("entra_oid").unique(),
    /** Lowercase. */
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    department: text("department").notNull().default(""),
    role: text("role").$type<EmployeeRole>().notNull().default("employee"),
    profileSyncedAt: timestamptz("profile_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("employees_role_check", sql`${table.role} in ('employee', 'admin')`),
    check(
      "employees_email_lowercase",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
).enableRLS();

/** Profile photos from Microsoft Graph. Served only to signed-in employees. */
export const employeePhotos = pgTable("employee_photos", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employees.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  etag: text("etag").notNull(),
  updatedAt: updatedAt(),
}).enableRLS();

/** Social handles linked to employees: the first approved post on a platform links its author. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    platform: text("platform").$type<Platform>().notNull(),
    /** Lowercase, without "@". */
    handle: text("handle").notNull(),
    linkedAt: timestamptz("linked_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.platform, table.handle] }),
    index("social_accounts_employee_idx").on(table.employeeId),
  ],
).enableRLS();

/** Evidence from the automated check, without its status and time (columns of their own). */
export type CheckDetails = Omit<PostCheck, "status" | "checkedAt">;

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    platform: text("platform").$type<Platform>().notNull(),
    contentType: text("content_type").$type<ContentType>().notNull(),
    category: text("category").$type<ContentCategory>().notNull(),
    urlSubmitted: text("url_submitted").notNull(),
    urlCanonical: text("url_canonical").notNull(),
    externalId: text("external_id"),
    title: text("title"),
    caption: text("caption"),
    authorHandle: text("author_handle"),
    authorName: text("author_name"),
    publishedAt: timestamptz("published_at"),
    publishedAtSource: text("published_at_source").$type<PublishedAtSource>(),
    /** The submitter's optional "posted on" date (a fallback only). */
    submittedPostedAt: date("submitted_posted_at", { mode: "string" }),
    submittedAt: timestamptz("submitted_at").notNull().defaultNow(),
    status: text("status").$type<PostStatus>().notNull().default("pending"),
    statusReason: text("status_reason").$type<ModerationReason>(),
    statusNote: text("status_note"),
    reviewedBy: uuid("reviewed_by").references(() => employees.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamptz("reviewed_at"),
    approvedAt: timestamptz("approved_at"),
    checkStatus: text("check_status")
      .$type<CheckStatus>()
      .notNull()
      .default("queued"),
    checkDetails: jsonb("check_details").$type<CheckDetails>(),
    checkedAt: timestamptz("checked_at"),
    checkAttempts: integer("check_attempts").notNull().default(0),
    lastRecheckAt: timestamptz("last_recheck_at"),
    views: integer("views"),
    reactions: integer("reactions").notNull().default(0),
    metricsSource: text("metrics_source")
      .$type<MetricsSource>()
      .notNull()
      .default("provider"),
    metricsLocked: boolean("metrics_locked").notNull().default(false),
    metricsFetchedAt: timestamptz("metrics_fetched_at"),
    consecutiveFetchFailures: integer("consecutive_fetch_failures")
      .notNull()
      .default(0),
    flags: text("flags")
      .array()
      .$type<PostFlag[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    thumbnailUrl: text("thumbnail_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Duplicates are caught on the post's own ID, else on the canonical link.
    uniqueIndex("posts_platform_external_id_key")
      .on(table.platform, table.externalId)
      .where(sql`${table.externalId} is not null`),
    uniqueIndex("posts_url_canonical_key").on(table.urlCanonical),
    index("posts_board_idx").on(
      table.status,
      table.category,
      table.publishedAt,
    ),
    index("posts_employee_idx").on(table.employeeId),
    check(
      "posts_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'disqualified')`,
    ),
    check(
      "posts_category_check",
      sql`${table.category} in ('video', 'static')`,
    ),
    check(
      "posts_check_status_check",
      sql`${table.checkStatus} in ('queued', 'running', 'passed', 'failed', 'error')`,
    ),
    check(
      "posts_metrics_check",
      sql`${table.reactions} >= 0 and (${table.views} is null or ${table.views} >= 0)`,
    ),
  ],
).enableRLS();

export const postMetricSnapshots = pgTable(
  "post_metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
    views: integer("views"),
    reactions: integer("reactions"),
    source: text("source").$type<MetricsSource>().notNull(),
    /** A trimmed copy of the provider's payload, for audits. */
    raw: jsonb("raw"),
  },
  (table) => [
    index("post_metric_snapshots_post_idx").on(
      table.postId,
      table.fetchedAt.desc(),
    ),
  ],
).enableRLS();

export const moderationEvents = pgTable(
  "moderation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** null for the system. */
    actorId: uuid("actor_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    reason: text("reason").$type<ModerationReason>(),
    note: text("note"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (table) => [
    index("moderation_events_post_idx").on(table.postId, table.createdAt),
  ],
).enableRLS();

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trigger: text("trigger").$type<SyncTrigger>().notNull(),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
    postsTotal: integer("posts_total").notNull().default(0),
    postsOk: integer("posts_ok").notNull().default(0),
    postsFailed: integer("posts_failed").notNull().default(0),
    error: text("error"),
  },
  (table) => [index("sync_runs_started_idx").on(table.startedAt.desc())],
).enableRLS();

export type EmployeeRow = typeof employees.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type SnapshotRow = typeof postMetricSnapshots.$inferSelect;
export type EventRow = typeof moderationEvents.$inferSelect;
export type SyncRunRow = typeof syncRuns.$inferSelect;
