import { type CampaignTagConfig, DEFAULT_MENTIONS } from "@/lib/campaign-tag";
import {
  applyModeration,
  type ModerationAction,
  type ModerationError,
} from "@/lib/moderation";
import { type CampaignWindow, isWithin } from "@/lib/periods";
import { evaluateFetch, isProviderFailure } from "@/lib/post-check";
import type { FetchOutcome } from "@/lib/post-data";
import type {
  ModerationPayload,
  ModerationReason,
  PostFlag,
  SyncRun,
  SyncTrigger,
} from "../types";
import type { MockPost, MockState, ProviderTruth } from "./types";

/**
 * The mock backend's rules, as plain functions over MockState. The seed data
 * is produced by replaying a scripted history through these same functions,
 * so seeded and live data always follow the same rules.
 */

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
/** Vercel Cron runs at 08:00 and 19:59 UTC (12:00 and 23:59 in Tbilisi), in minutes. */
export const CRON_MINUTES_UTC = [8 * 60, 19 * 60 + 59] as const;
export const SUBMISSION_GRACE_DAYS = 3;
export const METRICS_GRACE_DAYS = 3;
export const MANUAL_SYNC_COOLDOWN_MS = 15 * 60_000;
export const SUBMISSIONS_PER_DAY = 20;
/** How long a queued or re-run check takes in the mock. */
export const CHECK_DELAY_MS = 2_500;

/** The same tags as the server's defaults. */
export const MOCK_TAGS: CampaignTagConfig = {
  hashtags: ["CrocoBySquad"],
  mentions: DEFAULT_MENTIONS,
};
export const GROWTH_FLAG = { factor: 5, min: 1000 };

export function campaignOf(state: MockState): CampaignWindow {
  return {
    startsAt: new Date(state.campaign.startsAt),
    endsAt: new Date(state.campaign.endsAt),
    timeZone: state.campaign.timeZone,
  };
}

export function nextId(state: MockState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}-${state.nextId.toString(36)}`;
}

export function addEvent(
  state: MockState,
  post: MockPost,
  at: Date,
  actorId: string | null,
  action: string,
  reason: ModerationReason | null = null,
  note: string | null = null,
) {
  post.events.push({
    id: nextId(state, "evt"),
    at: at.toISOString(),
    actorId,
    action,
    reason,
    note,
  });
}

/** Cron times in (after, until]. */
export function cronSlotsBetween(after: Date, until: Date): Date[] {
  const slots: Date[] = [];
  const firstDay = Date.UTC(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
  );
  for (let day = firstDay; day <= until.getTime(); day += DAY_MS) {
    for (const minute of CRON_MINUTES_UTC) {
      const slot = day + minute * 60_000;
      if (slot > after.getTime() && slot <= until.getTime())
        slots.push(new Date(slot));
    }
  }
  return slots;
}

/** What the mock provider returns for a post at `now`. */
export function truthFetch(truth: ProviderTruth, now: Date): FetchOutcome {
  if (truth.error)
    return {
      ok: false,
      error: truth.error,
      retryable: truth.error !== "not_found",
    };
  const age = Math.max(
    0,
    (now.getTime() - Date.parse(truth.growthFrom)) / DAY_MS,
  );
  const growth = 1 - Math.exp(-age / truth.growthDays);
  return {
    ok: true,
    post: {
      canonicalUrl: null,
      externalId: null,
      mediaKind: truth.mediaKind,
      caption: truth.caption,
      hashtags: truth.hashtags,
      mentions: [],
      authorHandle: truth.authorHandle,
      authorName: null,
      publishedAt: truth.publishedAt ? new Date(truth.publishedAt) : null,
      views:
        truth.lifetimeViews === null
          ? null
          : Math.round(truth.lifetimeViews * growth),
      reactions: Math.round(truth.lifetimeReactions * growth),
      thumbnailUrl: null,
      raw: {},
    },
  };
}

/** Pending or approved, inside the window (or not yet dated), until the metrics grace ends. */
export function isActive(post: MockPost, state: MockState, now: Date): boolean {
  const campaign = campaignOf(state);
  if (post.status !== "pending" && post.status !== "approved") return false;
  if (Date.parse(post.submittedAt) > now.getTime()) return false;
  if (now.getTime() >= campaign.endsAt.getTime() + METRICS_GRACE_DAYS * DAY_MS)
    return false;
  return (
    post.publishedAt === null ||
    isWithin(new Date(post.publishedAt), {
      start: campaign.startsAt,
      end: campaign.endsAt,
    })
  );
}

const CHECK_EVENTS = {
  passed: "check_passed",
  failed: "check_failed",
  error: "check_error",
} as const;

/** Fetches a post from the mock provider and applies the result, like the sync job does. */
export function fetchPost(
  state: MockState,
  post: MockPost,
  now: Date,
  { logCheck = false }: { logCheck?: boolean } = {},
): boolean {
  const outcome = truthFetch(post.truth, now);
  if (
    isProviderFailure(outcome) &&
    post.check.status !== "queued" &&
    post.check.status !== "running"
  )
    return false;
  const lastProvider = post.snapshots.findLast(
    (snapshot) => snapshot.source === "provider",
  );
  const evaluation = evaluateFetch(
    {
      platform: post.platform,
      contentType: post.contentType,
      externalId: post.externalId,
      status: post.status,
      title: post.title,
      publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
      publishedAtSource: post.publishedAtSource,
      submittedPostedAt: post.submittedPostedAt,
      views: post.views,
      reactions: post.reactions,
      metricsLocked: post.metricsLocked,
      flags: post.flags,
      consecutiveFetchFailures: post.consecutiveFetchFailures,
      lastSnapshot: lastProvider
        ? { views: lastProvider.views, reactions: lastProvider.reactions }
        : null,
    },
    outcome,
    {
      now,
      campaign: campaignOf(state),
      tags: MOCK_TAGS,
      employeeId: post.employeeId,
      linkedHandles: state.socialAccounts.filter(
        (account) => account.platform === post.platform,
      ),
      growthFlag: GROWTH_FLAG,
    },
  );

  const newFlags = evaluation.flags.filter(
    (flag) => !post.flags.includes(flag),
  );
  if (evaluation.reclassified && post.contentType !== evaluation.contentType)
    addEvent(state, post, now, null, "reclassified");
  for (const flag of newFlags) addEvent(state, post, now, null, `flag:${flag}`);

  post.check = evaluation.check;
  post.checkDueAt = null;
  post.contentType = evaluation.contentType;
  post.title = evaluation.title;
  if (evaluation.caption !== null) post.caption = evaluation.caption;
  if (evaluation.authorHandle !== null)
    post.authorHandle = evaluation.authorHandle;
  post.publishedAt = evaluation.publishedAt?.toISOString() ?? null;
  post.publishedAtSource = evaluation.publishedAtSource;
  post.views = evaluation.views;
  post.reactions = evaluation.reactions;
  post.flags = evaluation.flags as PostFlag[];
  post.consecutiveFetchFailures = evaluation.consecutiveFetchFailures;
  if (evaluation.snapshot) {
    post.snapshots.push({
      fetchedAt: now.toISOString(),
      ...evaluation.snapshot,
      source: "provider",
    });
    if (!post.metricsLocked) {
      post.metricsUpdatedAt = now.toISOString();
      post.metricsSource = "provider";
    }
  }
  if (logCheck && evaluation.check.status in CHECK_EVENTS)
    addEvent(
      state,
      post,
      now,
      null,
      CHECK_EVENTS[evaluation.check.status as keyof typeof CHECK_EVENTS],
    );
  return evaluation.snapshot !== null;
}

/** The first approved post on a platform links its author handle to the employee. */
export function linkHandle(state: MockState, post: MockPost) {
  const handle = post.check.authorHandle;
  if (!handle) return;
  const taken = state.socialAccounts.some(
    (account) =>
      account.platform === post.platform && account.handle === handle,
  );
  if (!taken)
    state.socialAccounts.push({
      platform: post.platform,
      handle,
      employeeId: post.employeeId,
    });
}

export function runSync(
  state: MockState,
  now: Date,
  trigger: SyncTrigger,
): SyncRun {
  let ok = 0;
  let failed = 0;
  for (const post of state.posts) {
    if (!isActive(post, state, now)) continue;
    if (post.check.status === "queued" || post.check.status === "running")
      continue;
    if (fetchPost(state, post, now)) ok += 1;
    else failed += 1;
  }
  const run: SyncRun = {
    id: nextId(state, "sync"),
    trigger,
    startedAt: now.toISOString(),
    finishedAt: new Date(now.getTime() + 40_000).toISOString(),
    postsTotal: ok + failed,
    postsOk: ok,
    postsFailed: failed,
    error: null,
  };
  state.syncRuns.unshift(run);
  state.syncRuns.length = Math.min(state.syncRuns.length, 40);
  return run;
}

export type ModerateResult =
  { ok: true } | { ok: false; error: ModerationError };

/** Applies a moderation action through the shared state machine and audits it. */
export function moderate(
  state: MockState,
  post: MockPost,
  action: Exclude<ModerationAction, "withdraw" | "recheck">,
  actorId: string,
  payload: ModerationPayload,
  now: Date,
): ModerateResult {
  const note = payload.note?.trim() || null;
  const result = applyModeration({
    status: post.status,
    action,
    actor: "admin",
    reason: payload.reason ?? null,
    note,
    now,
  });
  if (!result.ok) return result;
  const next = result.next === "deleted" ? post.status : result.next;
  const at = now.toISOString();

  post.status = next;
  post.reviewedBy = actorId;
  post.reviewedAt = at;
  if (next === "approved") {
    post.approvedAt = at;
    post.statusReason = null;
    post.statusNote = action === "reinstate" ? null : note;
    linkHandle(state, post);
  } else if (next === "pending") {
    post.statusReason = null;
    post.statusNote = null;
  } else {
    post.statusReason = payload.reason ?? null;
    post.statusNote = note;
  }
  if (next !== "approved" && next !== "disqualified") post.approvedAt = null;

  const override = action === "approve" && post.check.status !== "passed";
  addEvent(
    state,
    post,
    now,
    actorId,
    override ? "approve_override" : action,
    payload.reason ?? null,
    note,
  );
  return { ok: true };
}
