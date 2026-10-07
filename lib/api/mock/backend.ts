import { fixtureFetch } from "@/lib/fixture-post";
import {
  applyModeration,
  type ModerationError,
  NOTE_MAX_LENGTH,
} from "@/lib/moderation";
import { isWithin, postedDateToInstant, submissionsOpen } from "@/lib/periods";
import {
  analyzePostUrl,
  CATEGORY_PLATFORMS,
  categoryOf,
  CONTENT_TYPE_INFO,
  isContentType,
} from "@/lib/platforms";
import {
  type BoardFilter,
  countedPosts,
  type PostHistory,
  postsAsOf,
  type RankablePost,
  rankBoard,
  rankMap,
} from "@/lib/ranking";
import {
  type BoardRange,
  dayRange,
  generateRounds,
  rangeDates,
  resolveBoardRange,
  ROUND_PROBLEM_CODES,
  type RoundKind,
  roundNumbers,
  roundProblem,
  type RoundRange,
  toRoundsResponse,
} from "@/lib/rounds";
import { displayedViews, postScore } from "@/lib/scoring";
import { standingsCsv } from "@/lib/standings-csv";
import { normalizeForSearch } from "@/lib/utils";
import { ApiError, type ApiErrorCode } from "../errors";
import type {
  AdminAction,
  AdminPost,
  AdminPostDetail,
  AdminPostPatch,
  AdminPostsQuery,
  AdminPostsResponse,
  AdminQueueTab,
  BoardSummary,
  BulkModerationPayload,
  BulkModerationResult,
  ChallengeInput,
  ChallengeWindow,
  ContentCategory,
  Employee,
  EmployeePostsQuery,
  EmployeeRole,
  ExportQuery,
  LeaderboardQuery,
  LeaderboardResponse,
  Me,
  ModerationPayload,
  MyPostsResponse,
  Post,
  Round,
  RoundInput,
  RoundPatch,
  RoundRef,
  RoundsResponse,
  SubmitPostPayload,
  SyncRun,
  SyncStatusResponse,
} from "../types";
import { MOCK_EMPLOYEES } from "./data";
import {
  addEvent,
  campaignOf,
  CHECK_DELAY_MS,
  cronSlotsBetween,
  DAY_MS,
  fetchPost,
  MANUAL_SYNC_COOLDOWN_MS,
  moderate,
  nextId,
  runSync,
  SUBMISSION_GRACE_DAYS,
  SUBMISSIONS_PER_DAY,
} from "./engine";
import type { MockEmployee, MockPost, MockState, ProviderTruth } from "./types";

const ADMIN_PAGE_SIZE = 20;
const TITLE_MAX_LENGTH = 120;

const EMPLOYEES = new Map(
  MOCK_EMPLOYEES.map((employee) => [employee.id, employee]),
);

function fail(status: number, code: ApiErrorCode, message: string): never {
  throw new ApiError({ status, code, message });
}

const MODERATION_ERRORS: Record<
  ModerationError,
  [number, ApiErrorCode, string]
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

function failModeration(error: ModerationError): never {
  const [status, code, message] = MODERATION_ERRORS[error];
  fail(status, code, message);
}

function publicEmployee(employee: MockEmployee): Employee {
  return {
    id: employee.id,
    name: employee.name,
    firstName: employee.firstName,
    lastName: employee.lastName,
    department: employee.department,
    avatarUrl: employee.avatarUrl,
  };
}

const PUBLIC_EMPLOYEES = new Map(
  MOCK_EMPLOYEES.map((employee) => [employee.id, publicEmployee(employee)]),
);

function employeeOf(post: MockPost): MockEmployee {
  const employee = EMPLOYEES.get(post.employeeId);
  if (!employee) throw new Error(`Unknown mock employee ${post.employeeId}`);
  return employee;
}

function toPost(post: MockPost): Post {
  const category = categoryOf(post.contentType);
  return {
    id: post.id,
    employeeId: post.employeeId,
    url: post.url,
    platform: post.platform,
    contentType: post.contentType,
    category,
    title: post.title,
    publishedAt: post.publishedAt,
    submittedAt: post.submittedAt,
    status: post.status,
    statusReason: post.statusReason,
    statusNote: post.statusNote,
    check: post.check,
    views: displayedViews(category, post.views),
    reactions: post.reactions,
    score: postScore(category, post.views, post.reactions),
    metricsUpdatedAt: post.metricsUpdatedAt,
    thumbnailUrl: post.thumbnailUrl,
  };
}

type Rankable = RankablePost & PostHistory;

function toRankable(post: MockPost): Rankable {
  return {
    id: post.id,
    employeeId: post.employeeId,
    url: post.url,
    platform: post.platform,
    contentType: post.contentType,
    category: categoryOf(post.contentType),
    status: post.status,
    publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
    views: post.views,
    reactions: post.reactions,
    approvedAt: post.approvedAt ? new Date(post.approvedAt) : null,
    metricsLocked: post.metricsLocked,
    snapshots: post.snapshots.map((snapshot) => ({
      fetchedAt: new Date(snapshot.fetchedAt),
      views: snapshot.views,
      reactions: snapshot.reactions,
      source: snapshot.source,
    })),
  };
}

function inTab(post: MockPost, tab: AdminQueueTab): boolean {
  if (tab === "flagged")
    return (
      (post.status === "pending" || post.status === "approved") &&
      post.flags.length > 0
    );
  return post.status === tab;
}

const newestSubmittedFirst = (a: MockPost, b: MockPost) =>
  Date.parse(b.submittedAt) - Date.parse(a.submittedAt);

/** The mock API: the same contract as the real backend, over in-memory state. */
export class MockBackend {
  constructor(
    readonly state: MockState,
    private readonly me: { id: string; role: EmployeeRole },
  ) {}

  /** Finishes due checks and runs cron syncs that came due. Returns true if anything changed. */
  settle(now: Date): boolean {
    let changed = false;
    for (const post of this.state.posts) {
      if (post.checkDueAt && Date.parse(post.checkDueAt) <= now.getTime()) {
        fetchPost(this.state, post, new Date(post.checkDueAt), {
          logCheck: true,
        });
        changed = true;
      }
    }
    const lastCron = this.state.syncRuns.find((run) => run.trigger === "cron");
    const after = new Date(
      lastCron
        ? Date.parse(lastCron.startedAt)
        : Date.parse(this.state.generatedAt),
    );
    for (const slot of cronSlotsBetween(after, now).slice(-4)) {
      runSync(this.state, slot, "cron");
      changed = true;
    }
    return changed;
  }

  private requireAdmin() {
    if (this.me.role !== "admin") fail(403, "forbidden", "Admins only");
  }

  private find(postId: string): MockPost {
    const post = this.state.posts.find((candidate) => candidate.id === postId);
    if (!post) fail(404, "not_found", "Post not found");
    return post;
  }

  private lastSyncedAt(now: Date): string | null {
    const run = this.state.syncRuns.find(
      (candidate) =>
        candidate.finishedAt !== null &&
        candidate.error === null &&
        Date.parse(candidate.finishedAt) <= now.getTime(),
    );
    return run?.finishedAt ?? null;
  }

  private rankables(): Rankable[] {
    return this.state.posts.map(toRankable);
  }

  getCurrentUser(): Me {
    const employee = EMPLOYEES.get(this.me.id);
    if (!employee) throw new Error("Mock current user is missing");
    return {
      ...publicEmployee(employee),
      email: employee.email,
      role: this.me.role,
    };
  }

  private roundRanges(): RoundRange[] {
    return this.state.rounds.map((round) => ({
      ...round,
      startsAt: new Date(round.startsAt),
      endsAt: new Date(round.endsAt),
    }));
  }

  /** The same resolution as the server: a chosen round, the current round, or the calendar. */
  private resolveBoard(
    query: {
      category: ContentCategory;
      platform: LeaderboardQuery["platform"];
      period: LeaderboardQuery["period"];
      round: string | null;
    },
    reference: Date,
    now: Date = reference,
  ): {
    filter: BoardFilter & { platform: LeaderboardQuery["platform"] };
    range: BoardRange;
    round: RoundRef | null;
  } {
    const rounds = this.roundRanges();
    const range = resolveBoardRange(query.period, {
      roundId: query.round,
      reference,
      now,
      campaign: campaignOf(this.state),
      rounds,
    });
    const valid =
      query.platform === "all" ||
      CATEGORY_PLATFORMS[query.category].includes(query.platform);
    return {
      filter: {
        category: query.category,
        platform: valid ? query.platform : "all",
        range: { start: range.start, end: range.end },
      },
      range,
      round: range.round
        ? {
            id: range.round.id,
            kind: range.round.kind,
            name: range.round.name,
            number: roundNumbers(rounds).get(range.round.id) ?? 1,
          }
        : null,
    };
  }

  getLeaderboard(query: LeaderboardQuery, now: Date): LeaderboardResponse {
    const campaign = campaignOf(this.state);
    const { filter, range, round } = this.resolveBoard(query, now);
    const posts = this.rankables();
    const yesterday = rankBoard(
      postsAsOf(posts, new Date(now.getTime() - DAY_MS)),
      PUBLIC_EMPLOYEES,
      filter,
    );
    const board = rankBoard(posts, PUBLIC_EMPLOYEES, filter, {
      search: query.search,
      meId: this.me.id,
      previousRanks: rankMap(yesterday),
    });
    return {
      query: {
        ...query,
        platform: filter.platform,
        round: query.round && round?.id === query.round ? query.round : null,
      },
      period: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        isCurrent: range.isCurrent,
        timeZone: campaign.timeZone,
        round,
      },
      entries: board.entries,
      totalParticipants: board.totalParticipants,
      myStanding: board.myStanding,
      lastSyncedAt: this.lastSyncedAt(now),
    };
  }

  getMyPosts(now: Date): MyPostsResponse {
    const mine = this.state.posts
      .filter((post) => post.employeeId === this.me.id)
      .sort(newestSubmittedFirst);
    const posts = this.rankables();
    const summary = (category: ContentCategory): BoardSummary => {
      const board = rankBoard(
        posts,
        PUBLIC_EMPLOYEES,
        this.resolveBoard(
          { category, platform: "all", period: "all", round: null },
          now,
        ).filter,
        { meId: this.me.id },
      );
      const entry = board.myStanding?.entry;
      return {
        rank: entry?.rank ?? null,
        totalParticipants: board.totalParticipants,
        score: entry?.score ?? 0,
        totalViews: category === "video" ? (entry?.totalViews ?? 0) : null,
        totalReactions: entry?.totalReactions ?? 0,
      };
    };
    return {
      posts: mine.map(toPost),
      summary: {
        postCount: mine.length,
        approvedCount: mine.filter((post) => post.status === "approved").length,
        pendingCount: mine.filter((post) => post.status === "pending").length,
        boards: { video: summary("video"), static: summary("static") },
      },
    };
  }

  getEmployeePosts(
    employeeId: string,
    query: EmployeePostsQuery,
    now: Date,
  ): Post[] {
    const { filter } = this.resolveBoard(query, now);
    const byId = new Map(this.state.posts.map((post) => [post.id, post]));
    return countedPosts(this.rankables(), employeeId, filter).map((post) =>
      toPost(byId.get(post.id)!),
    );
  }

  submitPost(payload: SubmitPostPayload, now: Date): Post {
    const analysis = analyzePostUrl(payload.url);
    if (analysis.status === "unsupported-platform")
      fail(422, "unsupported_platform", "Unsupported platform");
    if (analysis.status === "unsupported-content")
      fail(
        422,
        "unsupported_content",
        "Stories, profiles and feeds don't count",
      );
    if (analysis.status !== "valid")
      fail(422, "invalid_url", "Not a link to a post");

    const campaign = campaignOf(this.state);
    if (!submissionsOpen(now, campaign, SUBMISSION_GRACE_DAYS))
      fail(403, "challenge_closed", "Submissions are closed");

    const title = payload.title?.trim() || null;
    if (title && title.length > TITLE_MAX_LENGTH)
      fail(422, "validation_error", "Title too long");

    const recent = this.state.posts.filter(
      (post) =>
        post.employeeId === this.me.id &&
        now.getTime() - Date.parse(post.submittedAt) < DAY_MS,
    );
    if (recent.length >= SUBMISSIONS_PER_DAY)
      fail(429, "rate_limited", "Too many submissions today");

    const duplicate = this.state.posts.some(
      (post) =>
        post.url === analysis.normalizedUrl ||
        (analysis.externalId !== null &&
          post.platform === analysis.platform &&
          post.externalId === analysis.externalId),
    );
    if (duplicate)
      fail(409, "duplicate_post", "This post has already been submitted");

    const employee = EMPLOYEES.get(this.me.id)!;
    const fixture = fixtureFetch(
      {
        platform: analysis.platform,
        contentType: analysis.contentType,
        url: analysis.normalizedUrl,
        externalId: analysis.externalId,
      },
      // Far in the future, so the fixture reports the post's lifetime totals.
      { now: new Date(now.getTime() + 365 * DAY_MS), submittedAt: now },
    );
    const publishedAt = fixture.ok ? fixture.post.publishedAt : null;
    const truth: ProviderTruth = fixture.ok
      ? {
          error: null,
          caption: fixture.post.caption,
          hashtags: fixture.post.hashtags,
          // Usually posted from the employee's own account.
          authorHandle:
            fixture.post.authorHandle &&
            fixture.post.authorHandle.length % 10 === 0
              ? fixture.post.authorHandle
              : employee.handles[analysis.platform],
          mediaKind: fixture.post.mediaKind ?? "image",
          publishedAt: publishedAt?.toISOString() ?? null,
          lifetimeViews: fixture.post.views,
          lifetimeReactions: fixture.post.reactions ?? 0,
          growthDays: 3,
          growthFrom: (publishedAt ?? now).toISOString(),
        }
      : {
          error: fixture.error,
          caption: null,
          hashtags: [],
          authorHandle: null,
          mediaKind: "image",
          publishedAt: null,
          lifetimeViews: null,
          lifetimeReactions: 0,
          growthDays: 3,
          growthFrom: now.toISOString(),
        };

    const post: MockPost = {
      id: nextId(this.state, "post"),
      employeeId: this.me.id,
      url: analysis.normalizedUrl,
      platform: analysis.platform,
      contentType: analysis.contentType,
      externalId: analysis.externalId,
      title,
      caption: null,
      authorHandle: null,
      authorName: null,
      publishedAt: null,
      publishedAtSource: null,
      submittedPostedAt: null,
      submittedAt: now.toISOString(),
      status: "pending",
      statusReason: null,
      statusNote: null,
      reviewedBy: null,
      reviewedAt: null,
      approvedAt: null,
      check: {
        status: "queued",
        tagFound: null,
        matched: [],
        authorHandle: null,
        ownerMatch: null,
        publishedInWindow: null,
        error: null,
        checkedAt: null,
      },
      checkDueAt: new Date(now.getTime() + CHECK_DELAY_MS).toISOString(),
      lastRecheckAt: null,
      views: null,
      reactions: 0,
      metricsSource: "provider",
      metricsLocked: false,
      metricsUpdatedAt: null,
      flags: [],
      consecutiveFetchFailures: 0,
      thumbnailUrl: null,
      snapshots: [],
      events: [],
      truth,
    };
    this.state.posts.push(post);
    addEvent(this.state, post, now, this.me.id, "submitted");
    return toPost(post);
  }

  withdrawPost(postId: string): void {
    const post = this.find(postId);
    if (post.employeeId !== this.me.id)
      fail(404, "not_found", "Post not found");
    const result = applyModeration({
      status: post.status,
      action: "withdraw",
      actor: "owner",
    });
    if (!result.ok) failModeration(result.error);
    this.state.posts = this.state.posts.filter(
      (candidate) => candidate !== post,
    );
  }

  recheckPost(postId: string, now: Date): void {
    const post = this.find(postId);
    const owner = post.employeeId === this.me.id;
    if (!owner && this.me.role !== "admin")
      fail(404, "not_found", "Post not found");
    const result = applyModeration({
      status: post.status,
      action: "recheck",
      actor: owner ? "owner" : "admin",
      lastRecheckAt: post.lastRecheckAt ? new Date(post.lastRecheckAt) : null,
      now,
    });
    if (!result.ok) failModeration(result.error);

    // In the mock, the owner usually re-checks because they fixed the post.
    if (owner) {
      if (post.check.tagFound === false && Math.random() < 0.7) {
        post.truth.caption = `${post.truth.caption ?? ""}\n\n#CrocoBySquad`;
        post.truth.hashtags = [...post.truth.hashtags, "CrocoBySquad"];
      }
      if (post.truth.error === "private" && Math.random() < 0.6)
        post.truth.error = null;
      post.lastRecheckAt = now.toISOString();
    }
    post.check = { ...post.check, status: "running" };
    post.checkDueAt = new Date(now.getTime() + CHECK_DELAY_MS).toISOString();
    addEvent(this.state, post, now, this.me.id, "recheck");
  }

  // ------------------------------------------------------------ admin

  private toAdminPost(post: MockPost): AdminPost {
    const employee = employeeOf(post);
    const reviewer = post.reviewedBy ? EMPLOYEES.get(post.reviewedBy) : null;
    return {
      ...toPost(post),
      employee: { ...publicEmployee(employee), email: employee.email },
      caption: post.caption,
      authorName: post.authorName,
      flags: post.flags,
      metricsSource: post.metricsSource,
      metricsLocked: post.metricsLocked,
      publishedAtSource: post.publishedAtSource,
      reviewedBy: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
      reviewedAt: post.reviewedAt,
    };
  }

  private toAdminDetail(post: MockPost): AdminPostDetail {
    return {
      ...this.toAdminPost(post),
      snapshots: post.snapshots,
      events: [...post.events].reverse().map((event) => {
        const actor = event.actorId ? EMPLOYEES.get(event.actorId) : null;
        return {
          id: event.id,
          at: event.at,
          actor: actor ? { id: actor.id, name: actor.name } : null,
          action: event.action,
          reason: event.reason,
          note: event.note,
        };
      }),
      linkedHandles: this.state.socialAccounts.filter(
        (account) =>
          account.platform === post.platform &&
          (account.employeeId === post.employeeId ||
            account.handle === post.check.authorHandle),
      ),
    };
  }

  getAdminPosts(
    query: AdminPostsQuery,
    cursor: string | null,
  ): AdminPostsResponse {
    this.requireAdmin();
    const search = normalizeForSearch(query.q);
    const handlesOf = (employeeId: string) =>
      this.state.socialAccounts
        .filter((account) => account.employeeId === employeeId)
        .map((account) => account.handle);

    const filtered = this.state.posts.filter((post) => {
      if (query.check !== "all" && post.check.status !== query.check)
        return false;
      if (query.flag !== "all" && !post.flags.includes(query.flag))
        return false;
      if (
        query.category !== "all" &&
        categoryOf(post.contentType) !== query.category
      )
        return false;
      if (query.platform !== "all" && post.platform !== query.platform)
        return false;
      if (search) {
        const employee = employeeOf(post);
        const haystack = [
          employee.name,
          employee.email,
          post.check.authorHandle ?? "",
          ...handlesOf(post.employeeId),
        ].map(normalizeForSearch);
        if (!haystack.some((value) => value.includes(search))) return false;
      }
      return true;
    });

    const tabs: AdminQueueTab[] = [
      "pending",
      "approved",
      "rejected",
      "disqualified",
      "flagged",
    ];
    const counts = Object.fromEntries(
      tabs.map((tab) => [
        tab,
        filtered.filter((post) => inTab(post, tab)).length,
      ]),
    ) as Record<AdminQueueTab, number>;

    const inQueue = filtered
      .filter((post) => inTab(post, query.status))
      // Most recently submitted first, like the real backend.
      .sort(newestSubmittedFirst);
    const offset = Math.max(0, Number(cursor) || 0);
    const page = inQueue.slice(offset, offset + ADMIN_PAGE_SIZE);
    return {
      posts: page.map((post) => this.toAdminPost(post)),
      nextCursor:
        offset + ADMIN_PAGE_SIZE < inQueue.length
          ? String(offset + ADMIN_PAGE_SIZE)
          : null,
      counts,
    };
  }

  getAdminPost(postId: string): AdminPostDetail {
    this.requireAdmin();
    return this.toAdminDetail(this.find(postId));
  }

  updateAdminPost(
    postId: string,
    patch: AdminPostPatch,
    now: Date,
  ): AdminPostDetail {
    this.requireAdmin();
    const post = this.find(postId);
    const note = patch.note?.trim() || null;
    if (note && note.length > NOTE_MAX_LENGTH)
      fail(422, "validation_error", "Note too long");
    const isCount = (value: unknown) =>
      typeof value === "number" && Number.isInteger(value) && value >= 0;

    if (patch.contentType !== undefined) {
      if (
        !isContentType(patch.contentType) ||
        CONTENT_TYPE_INFO[patch.contentType].platform !== post.platform
      )
        fail(
          422,
          "validation_error",
          "Content type doesn't match the platform",
        );
      if (patch.contentType !== post.contentType) {
        post.contentType = patch.contentType;
        addEvent(
          this.state,
          post,
          now,
          this.me.id,
          "edit_content_type",
          null,
          note,
        );
      }
    }

    const category = categoryOf(post.contentType);
    const viewsChanged =
      patch.views !== undefined && patch.views !== post.views;
    const reactionsChanged =
      patch.reactions !== undefined && patch.reactions !== post.reactions;
    if (
      patch.views !== undefined &&
      patch.views !== null &&
      !isCount(patch.views)
    )
      fail(422, "validation_error", "Views must be a whole number");
    if (
      patch.views !== undefined &&
      category === "static" &&
      patch.views !== null
    )
      fail(422, "validation_error", "Static posts don't count views");
    if (patch.reactions !== undefined && !isCount(patch.reactions))
      fail(422, "validation_error", "Reactions must be a whole number");
    if (viewsChanged || reactionsChanged) {
      if (patch.views !== undefined) post.views = patch.views;
      if (patch.reactions !== undefined) post.reactions = patch.reactions;
      post.metricsSource = "manual";
      post.metricsUpdatedAt = now.toISOString();
      post.snapshots.push({
        fetchedAt: now.toISOString(),
        views: post.views,
        reactions: post.reactions,
        source: "manual",
      });
      if (category === "video" && post.views !== null)
        post.flags = post.flags.filter(
          (flag) => flag !== "metrics_unavailable",
        );
      addEvent(this.state, post, now, this.me.id, "edit_metrics", null, note);
    }

    if (
      patch.metricsLocked !== undefined &&
      patch.metricsLocked !== post.metricsLocked
    ) {
      post.metricsLocked = patch.metricsLocked;
      addEvent(
        this.state,
        post,
        now,
        this.me.id,
        patch.metricsLocked ? "lock_metrics" : "unlock_metrics",
        null,
        note,
      );
    }

    if (patch.publishedAt !== undefined) {
      const publishedAt = new Date(patch.publishedAt);
      if (Number.isNaN(publishedAt.getTime()) || publishedAt > now)
        fail(422, "validation_error", "Invalid publish date");
      if (publishedAt.toISOString() !== post.publishedAt) {
        const campaign = campaignOf(this.state);
        post.publishedAt = publishedAt.toISOString();
        post.publishedAtSource = "admin";
        post.flags = post.flags.filter(
          (flag) => flag !== "published_date_uncertain",
        );
        post.check = {
          ...post.check,
          publishedInWindow: isWithin(publishedAt, {
            start: campaign.startsAt,
            end: campaign.endsAt,
          }),
        };
        addEvent(
          this.state,
          post,
          now,
          this.me.id,
          "edit_published_at",
          null,
          note,
        );
      }
    }
    return this.toAdminDetail(post);
  }

  moderatePost(
    postId: string,
    action: AdminAction,
    payload: ModerationPayload,
    now: Date,
  ): AdminPostDetail {
    this.requireAdmin();
    const post = this.find(postId);
    if ((payload.note?.length ?? 0) > NOTE_MAX_LENGTH)
      fail(422, "validation_error", "Note too long");
    const result = moderate(this.state, post, action, this.me.id, payload, now);
    if (!result.ok) failModeration(result.error);
    return this.toAdminDetail(post);
  }

  bulkModerate(
    payload: BulkModerationPayload,
    now: Date,
  ): BulkModerationResult {
    this.requireAdmin();
    return {
      results: [...new Set(payload.ids)].map((id) => {
        try {
          this.moderatePost(
            id,
            payload.action,
            { reason: payload.reason, note: payload.note },
            now,
          );
          return { id, ok: true, error: null };
        } catch (error) {
          return {
            id,
            ok: false,
            error: error instanceof ApiError ? error.code : "unknown",
          };
        }
      }),
    };
  }

  deleteAdminPost(postId: string): void {
    this.requireAdmin();
    const post = this.find(postId);
    this.state.posts = this.state.posts.filter(
      (candidate) => candidate !== post,
    );
  }

  refreshPost(postId: string, now: Date): void {
    this.requireAdmin();
    const post = this.find(postId);
    fetchPost(this.state, post, now);
    addEvent(this.state, post, now, this.me.id, "refresh");
  }

  getSyncStatus(): SyncStatusResponse {
    this.requireAdmin();
    return { runs: this.state.syncRuns.slice(0, 10) };
  }

  startSync(now: Date): SyncRun {
    this.requireAdmin();
    const lastManual = this.state.syncRuns.find(
      (run) => run.trigger === "manual",
    );
    if (
      lastManual &&
      now.getTime() - Date.parse(lastManual.startedAt) < MANUAL_SYNC_COOLDOWN_MS
    )
      fail(429, "rate_limited", "A sync ran less than 15 minutes ago");
    const run = runSync(this.state, now, "manual");
    // Manual runs finish quickly in the mock.
    run.finishedAt = new Date(now.getTime() + 3_000).toISOString();
    return run;
  }

  exportStandings(query: ExportQuery, now: Date): string {
    this.requireAdmin();
    const campaign = campaignOf(this.state);
    const reference =
      query.period !== "all" && query.periodStart
        ? (postedDateToInstant(query.periodStart, campaign.timeZone) ?? now)
        : now;
    const { filter } = this.resolveBoard(
      {
        category: query.category,
        platform: "all",
        period: query.period,
        round: query.round ?? null,
      },
      reference,
      now,
    );
    const asOf = query.asOf ? new Date(query.asOf) : now;
    if (Number.isNaN(asOf.getTime()))
      fail(422, "validation_error", "Invalid asOf");

    const posts = postsAsOf(this.rankables(), asOf);
    const board = rankBoard(posts, PUBLIC_EMPLOYEES, filter);
    return standingsCsv(
      board.entries.map((entry) => {
        const employee = EMPLOYEES.get(entry.employee.id)!;
        return {
          rank: entry.rank,
          name: entry.employee.name,
          email: employee.email,
          department: entry.employee.department,
          posts: entry.postCount,
          views: entry.totalViews,
          reactions: entry.totalReactions,
          score: entry.score,
          urls: countedPosts(posts, entry.employee.id, filter).map(
            (post) => post.url,
          ),
        };
      }),
    );
  }

  // ----------------------------------------------------------- rounds

  getRounds(): RoundsResponse {
    return toRoundsResponse(
      this.roundRanges(),
      campaignOf(this.state),
      this.state.campaignSource,
    );
  }

  private findRound(roundId: string): Round {
    const round = this.getRounds().rounds.find(
      (candidate) => candidate.id === roundId,
    );
    if (!round) fail(404, "not_found", "Round not found");
    return round;
  }

  private checkRound(candidate: {
    id?: string;
    kind: RoundKind;
    startsAt: Date;
    endsAt: Date;
  }) {
    const problem = roundProblem(
      candidate,
      this.roundRanges(),
      campaignOf(this.state),
    );
    if (problem) fail(422, ROUND_PROBLEM_CODES[problem], problem);
  }

  createRound(input: RoundInput): Round {
    this.requireAdmin();
    const range = dayRange(
      input.startDate,
      input.endDate,
      this.state.campaign.timeZone,
    );
    if (!range) fail(422, "invalid_dates", "Invalid dates");
    this.checkRound({ kind: input.kind, ...range });
    const id = nextId(this.state, "round");
    this.state.rounds.push({
      id,
      kind: input.kind,
      name: input.name?.trim() || null,
      startsAt: range.startsAt.toISOString(),
      endsAt: range.endsAt.toISOString(),
    });
    return this.findRound(id);
  }

  updateRound(roundId: string, patch: RoundPatch): Round {
    this.requireAdmin();
    const round = this.state.rounds.find(
      (candidate) => candidate.id === roundId,
    );
    if (!round) fail(404, "not_found", "Round not found");
    const { timeZone } = this.state.campaign;
    const current = rangeDates(
      new Date(round.startsAt),
      new Date(round.endsAt),
      timeZone,
    );
    const range = dayRange(
      patch.startDate ?? current.startDate,
      patch.endDate ?? current.endDate,
      timeZone,
    );
    if (!range) fail(422, "invalid_dates", "Invalid dates");
    this.checkRound({ id: round.id, kind: round.kind, ...range });
    round.startsAt = range.startsAt.toISOString();
    round.endsAt = range.endsAt.toISOString();
    if (patch.name !== undefined) round.name = patch.name?.trim() || null;
    return this.findRound(roundId);
  }

  deleteRound(roundId: string): void {
    this.requireAdmin();
    const before = this.state.rounds.length;
    this.state.rounds = this.state.rounds.filter(
      (round) => round.id !== roundId,
    );
    if (this.state.rounds.length === before)
      fail(404, "not_found", "Round not found");
  }

  generateRounds(kind: RoundKind): RoundsResponse {
    this.requireAdmin();
    if (this.state.rounds.some((round) => round.kind === kind))
      fail(409, "rounds_exist", "Rounds of this kind already exist");
    for (const round of generateRounds(kind, campaignOf(this.state)))
      this.state.rounds.push({
        id: nextId(this.state, "round"),
        kind,
        name: null,
        startsAt: round.startsAt.toISOString(),
        endsAt: round.endsAt.toISOString(),
      });
    return this.getRounds();
  }

  updateChallenge(input: ChallengeInput): ChallengeWindow {
    this.requireAdmin();
    const range = dayRange(
      input.startDate,
      input.endDate,
      this.state.campaign.timeZone,
    );
    if (!range || !(range.endsAt > range.startsAt))
      fail(422, "invalid_dates", "Invalid dates");
    this.state.campaign = {
      ...this.state.campaign,
      startsAt: range.startsAt.toISOString(),
      endsAt: range.endsAt.toISOString(),
    };
    this.state.campaignSource = "admin";
    return this.getRounds().challenge;
  }
}
