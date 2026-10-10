import "server-only";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { isWithin } from "@/lib/periods";
import { analyzePostUrl, categoryOf } from "@/lib/platforms";
import {
  autoRejection,
  autoRejectNote,
  evaluateFetch,
  isProviderFailure,
} from "@/lib/post-check";
import type { FetchOutcome } from "@/lib/post-data";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  type CheckDetails,
  moderationEvents,
  postMetricSnapshots,
  posts,
  type PostRow,
  socialAccounts,
} from "@/lib/server/db/schema";
import { type PostDataProvider, providerFor } from "@/lib/server/providers";

/** Provider payloads kept for audits are trimmed to this size. */
const RAW_MAX_CHARS = 8_000;

function trimRaw(raw: unknown): unknown {
  try {
    const text = JSON.stringify(raw ?? null);
    return text.length <= RAW_MAX_CHARS
      ? JSON.parse(text)
      : { truncated: true };
  } catch {
    return null;
  }
}

const DUPLICATE_NOTE = "The same post was already submitted.";

/**
 * For a post stored with an unresolved short link: the canonical link and
 * ID the provider reports, and whether another post already has them.
 */
async function adoptCanonical(
  db: Db,
  row: PostRow,
  outcome: FetchOutcome,
): Promise<{
  urlCanonical: string;
  externalId: string | null;
  duplicate: boolean;
} | null> {
  if (row.externalId !== null || !outcome.ok || !outcome.post.canonicalUrl)
    return null;
  const analysis = analyzePostUrl(outcome.post.canonicalUrl);
  if (
    analysis.status !== "valid" ||
    analysis.needsResolution ||
    analysis.platform !== row.platform ||
    analysis.normalizedUrl === row.urlCanonical
  )
    return null;
  const externalId = analysis.externalId ?? outcome.post.externalId;
  const [other] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        ne(posts.id, row.id),
        or(
          eq(posts.urlCanonical, analysis.normalizedUrl),
          externalId
            ? and(
                eq(posts.platform, row.platform),
                eq(posts.externalId, externalId),
              )
            : undefined,
        ),
      ),
    )
    .limit(1);
  return {
    urlCanonical: analysis.normalizedUrl,
    externalId,
    duplicate: other !== undefined,
  };
}

const CHECK_EVENTS = {
  passed: "check_passed",
  failed: "check_failed",
  error: "check_error",
} as const;

/**
 * Applies one provider fetch to a post with the shared rules
 * (lib/post-check.ts): the check, flags, reclassification, publish date,
 * metrics and a snapshot, plus system events. One transaction.
 */
export async function applyFetch(
  db: Db,
  config: ServerConfig,
  row: PostRow,
  outcome: FetchOutcome,
  { now, logCheck = false }: { now: Date; logCheck?: boolean },
): Promise<{ ok: boolean }> {
  // A provider outage says nothing about the post: keep a finished check as it is.
  if (
    isProviderFailure(outcome) &&
    row.checkStatus !== "queued" &&
    row.checkStatus !== "running"
  )
    return { ok: false };
  const linkedHandles = await db
    .select({
      handle: socialAccounts.handle,
      employeeId: socialAccounts.employeeId,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, row.platform));
  const [lastSnapshot] = await db
    .select({
      views: postMetricSnapshots.views,
      reactions: postMetricSnapshots.reactions,
    })
    .from(postMetricSnapshots)
    .where(
      and(
        eq(postMetricSnapshots.postId, row.id),
        eq(postMetricSnapshots.source, "provider"),
      ),
    )
    .orderBy(desc(postMetricSnapshots.fetchedAt))
    .limit(1);

  const evaluation = evaluateFetch(
    {
      platform: row.platform,
      contentType: row.contentType,
      externalId: row.externalId,
      status: row.status,
      title: row.title,
      publishedAt: row.publishedAt,
      publishedAtSource: row.publishedAtSource,
      submittedPostedAt: row.submittedPostedAt,
      views: row.views,
      reactions: row.reactions,
      metricsLocked: row.metricsLocked,
      flags: row.flags,
      consecutiveFetchFailures: row.consecutiveFetchFailures,
      lastSnapshot: lastSnapshot ?? null,
    },
    outcome,
    {
      now,
      campaign: config.campaign,
      tags: config.tags,
      employeeId: row.employeeId,
      linkedHandles,
      growthFlag: config.growthFlag,
    },
  );
  // A short link the submit couldn't resolve: adopt the real link now and
  // catch a duplicate that slipped through.
  const canonical = await adoptCanonical(db, row, outcome);
  const duplicateOf = canonical?.duplicate ?? false;

  const check = evaluation.check;
  const checkStatus = check.status;
  const checkDetails: CheckDetails = {
    tagFound: check.tagFound,
    matched: check.matched,
    authorHandle: check.authorHandle,
    ownerMatch: check.ownerMatch,
    publishedInWindow: check.publishedInWindow,
    error: check.error,
  };
  // Posts that can't count never reach the admins: the check rejects them
  // with the reason, so the owner knows what to fix.
  const autoReason = duplicateOf
    ? null
    : autoRejection(row.status, check, evaluation.publishedAtSource);
  const newFlags = evaluation.flags.filter((flag) => !row.flags.includes(flag));
  const fetched = evaluation.snapshot !== null;

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        checkStatus,
        checkDetails,
        checkedAt: now,
        checkAttempts: row.checkAttempts + 1,
        contentType: evaluation.contentType,
        category: categoryOf(evaluation.contentType),
        title: evaluation.title,
        ...(evaluation.caption !== null ? { caption: evaluation.caption } : {}),
        ...(evaluation.authorHandle !== null
          ? { authorHandle: evaluation.authorHandle }
          : {}),
        ...(evaluation.authorName !== null
          ? { authorName: evaluation.authorName }
          : {}),
        ...(evaluation.thumbnailUrl !== null
          ? { thumbnailUrl: evaluation.thumbnailUrl }
          : {}),
        publishedAt: evaluation.publishedAt,
        publishedAtSource: evaluation.publishedAtSource,
        views: evaluation.views,
        reactions: evaluation.reactions,
        flags: evaluation.flags,
        consecutiveFetchFailures: evaluation.consecutiveFetchFailures,
        ...(canonical && !duplicateOf
          ? {
              urlCanonical: canonical.urlCanonical,
              externalId: canonical.externalId,
            }
          : {}),
        ...(duplicateOf && row.status === "pending"
          ? {
              status: "rejected" as const,
              statusReason: "duplicate" as const,
              statusNote: DUPLICATE_NOTE,
              reviewedAt: now,
            }
          : {}),
        ...(fetched && !row.metricsLocked
          ? { metricsFetchedAt: now, metricsSource: "provider" as const }
          : {}),
      })
      .where(eq(posts.id, row.id));

    if (evaluation.snapshot)
      await tx.insert(postMetricSnapshots).values({
        postId: row.id,
        fetchedAt: now,
        views: evaluation.snapshot.views,
        reactions: evaluation.snapshot.reactions,
        source: "provider",
        raw: outcome.ok ? trimRaw(outcome.post.raw) : null,
      });

    const events: (typeof moderationEvents.$inferInsert)[] = [];
    if (evaluation.reclassified && row.contentType !== evaluation.contentType)
      events.push({
        postId: row.id,
        action: "reclassified",
        before: { contentType: row.contentType },
        after: { contentType: evaluation.contentType },
        createdAt: now,
      });
    for (const flag of newFlags)
      events.push({ postId: row.id, action: `flag:${flag}`, createdAt: now });
    if (duplicateOf && row.status === "pending")
      events.push({
        postId: row.id,
        action: "reject",
        reason: "duplicate",
        note: DUPLICATE_NOTE,
        before: { status: row.status },
        after: { status: "rejected" },
        createdAt: now,
      });
    // The audit log records every change of the check result.
    if (
      (logCheck || row.checkStatus !== checkStatus) &&
      checkStatus in CHECK_EVENTS
    )
      events.push({
        postId: row.id,
        action: CHECK_EVENTS[checkStatus as keyof typeof CHECK_EVENTS],
        createdAt: now,
      });
    // Only while still pending: an admin may have decided during the fetch.
    const rejected = autoReason
      ? await tx
          .update(posts)
          .set({
            status: "rejected",
            statusReason: autoReason,
            statusNote: autoRejectNote(autoReason, check),
            reviewedBy: null,
            reviewedAt: now,
            approvedAt: null,
          })
          .where(and(eq(posts.id, row.id), eq(posts.status, "pending")))
          .returning({ id: posts.id })
      : [];
    if (autoReason && rejected.length > 0)
      events.push({
        postId: row.id,
        action: "reject",
        reason: autoReason,
        note: autoRejectNote(autoReason, check),
        before: { status: "pending" },
        after: { status: "rejected" },
        createdAt: now,
      });
    if (events.length > 0) await tx.insert(moderationEvents).values(events);
  });
  return { ok: fetched };
}

/** Fetches one post from its platform's provider and applies the result. */
export async function runCheck(
  db: Db,
  config: ServerConfig,
  postId: string,
  {
    now = new Date(),
    logCheck = true,
    provider,
  }: { now?: Date; logCheck?: boolean; provider?: PostDataProvider } = {},
): Promise<void> {
  const row = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!row) return;
  const ref = {
    platform: row.platform,
    contentType: row.contentType,
    url: row.urlCanonical,
    externalId: row.externalId,
    submittedAt: row.submittedAt,
  };
  let outcome: FetchOutcome;
  try {
    const source = provider ?? providerFor(row.platform, config);
    const outcomes = await source.fetchMany([ref], {
      signal: AbortSignal.timeout(source.timeoutMs ?? 30_000),
      now,
    });
    outcome = outcomes.get(ref.url) ?? {
      ok: false,
      error: "provider_error",
      retryable: true,
    };
  } catch (error) {
    console.warn("[checks] provider failed", error);
    outcome = { ok: false, error: "provider_error", retryable: true };
  }
  await applyFetch(db, config, row, outcome, { now, logCheck });
}

/**
 * Rejects pending posts that can't count, from what's already stored: posts
 * checked before automatic rejection existed, and posts that fall outside
 * the challenge after admins change its dates (the sync no longer fetches
 * those, so applyFetch never sees them). Returns how many it rejected.
 */
export async function rejectPendingThatCannotCount(
  db: Db,
  config: ServerConfig,
  now: Date,
): Promise<number> {
  const pending = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "pending"));
  const window = {
    start: config.campaign.startsAt,
    end: config.campaign.endsAt,
  };
  let rejected = 0;
  for (const row of pending) {
    const reason = autoRejection(
      row.status,
      {
        status: row.checkStatus,
        publishedInWindow: row.publishedAt
          ? isWithin(row.publishedAt, window)
          : null,
      },
      row.publishedAtSource,
    );
    if (!reason) continue;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(posts)
        .set({
          status: "rejected",
          statusReason: reason,
          statusNote: autoRejectNote(reason, {
            tagFound: row.checkDetails?.tagFound ?? null,
          }),
          reviewedBy: null,
          reviewedAt: now,
          approvedAt: null,
        })
        .where(and(eq(posts.id, row.id), eq(posts.status, "pending")))
        .returning({ id: posts.id });
      if (!updated) return;
      rejected += 1;
      await tx.insert(moderationEvents).values({
        postId: row.id,
        action: "reject",
        reason,
        note: autoRejectNote(reason, {
          tagFound: row.checkDetails?.tagFound ?? null,
        }),
        before: { status: "pending" },
        after: { status: "rejected" },
        createdAt: now,
      });
    });
  }
  return rejected;
}
