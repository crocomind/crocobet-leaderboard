import { sql } from "drizzle-orm";
import { type ContentType, CONTENT_TYPE_INFO } from "@/lib/platforms";
import { parseServerConfig, type ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  employees,
  type EmployeeRow,
  postMetricSnapshots,
  posts,
  type PostRow,
} from "@/lib/server/db/schema";
import type { ServiceContext } from "@/lib/server/services/posts";

/** A challenge running through October–December 2026 (Tbilisi time). */
export const testConfig: ServerConfig = parseServerConfig({
  CHALLENGE_STARTS_AT: "2026-10-01T00:00:00+04:00",
  CHALLENGE_ENDS_AT: "2027-01-01T00:00:00+04:00",
  ADMIN_EMAILS: "boss@crocobet.com",
  POST_DATA_PROVIDER: "fixture",
});

export async function resetDb(db: Db) {
  await db.execute(
    sql`truncate employees, employee_photos, social_accounts, posts, post_metric_snapshots, moderation_events, sync_runs, leaderboard_rounds, challenge_settings cascade`,
  );
}

let sequence = 0;

export async function makeEmployee(
  db: Db,
  overrides: Partial<typeof employees.$inferInsert> = {},
): Promise<EmployeeRow> {
  sequence += 1;
  const [row] = await db
    .insert(employees)
    .values({
      email: `person${sequence}@crocobet.com`,
      displayName: `Person ${sequence}`,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makePost(
  db: Db,
  employeeId: string,
  contentType: ContentType,
  overrides: Partial<typeof posts.$inferInsert> & {
    snapshots?: { at: Date; views: number | null; reactions: number }[];
  } = {},
): Promise<PostRow> {
  sequence += 1;
  const { snapshots = [], ...values } = overrides;
  const info = CONTENT_TYPE_INFO[contentType];
  const url = `https://example.test/${info.platform}/${sequence}`;
  const [row] = await db
    .insert(posts)
    .values({
      employeeId,
      platform: info.platform,
      contentType,
      category: info.category,
      urlSubmitted: url,
      urlCanonical: url,
      externalId: `ext-${sequence}`,
      status: "approved",
      checkStatus: "passed",
      publishedAt: new Date("2026-10-12T12:00:00+04:00"),
      approvedAt: new Date("2026-10-12T18:00:00+04:00"),
      submittedAt: new Date("2026-10-12T13:00:00+04:00"),
      ...values,
    })
    .returning();
  if (snapshots.length > 0)
    await db.insert(postMetricSnapshots).values(
      snapshots.map((snapshot) => ({
        postId: row!.id,
        fetchedAt: snapshot.at,
        views: snapshot.views,
        reactions: snapshot.reactions,
        source: "provider" as const,
      })),
    );
  return row!;
}

/** A service context whose deferred work runs when `flush()` is called. */
export function serviceContext(
  db: Db,
  now: Date,
  config: ServerConfig = testConfig,
): ServiceContext & { flush: () => Promise<void> } {
  const tasks: (() => Promise<unknown>)[] = [];
  return {
    db,
    config,
    now,
    clock: () => now,
    defer: (task) => tasks.push(task),
    flush: async () => {
      while (tasks.length > 0) await tasks.shift()!();
    },
  };
}
