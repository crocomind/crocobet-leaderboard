# Croco By Squad API contract (v1)

The backend lives in this repo: Next.js Route Handlers under **`/api/v1`**, Supabase Postgres and
Vercel Cron. The frontend's TypeScript types are in [`lib/api/types.ts`](lib/api/types.ts). The
mock backend in [`lib/api/mock/`](lib/api/mock/) implements the same contract with the same pure
logic ([`lib/ranking.ts`](lib/ranking.ts), [`lib/scoring.ts`](lib/scoring.ts),
[`lib/periods.ts`](lib/periods.ts), [`lib/moderation.ts`](lib/moderation.ts)), so mock and real
behavior can't drift apart.

## Basics

- **Base URL:** `/api/v1` on the app's own origin (`NEXT_PUBLIC_API_BASE_URL=/api/v1`).
- **Authentication:** the Better Auth session cookie (Microsoft sign-in, `@crocobet.com` only).
  No Bearer token. Every handler re-checks the session, and admin handlers also check the role.
  The frontend never sends an employee ID for "me".
- **Format:** JSON in and out. `POST`, `PATCH` and `DELETE` must come from the app's own origin
  (checked on the `Origin` header).
- **Timestamps:** `IsoDateTime` is ISO 8601 in UTC (`"2026-10-01T09:30:00.000Z"`). `IsoDate` is
  a calendar date (`"2026-09-28"`).
- **Time zone:** weeks and months are computed in `CAMPAIGN_TIMEZONE` (default `Asia/Tbilisi`).

## Errors

Non-2xx responses use this body. `message` is for logs; the UI shows its own translated text.

```json
{
  "error": {
    "code": "duplicate_post",
    "message": "This post has already been submitted"
  }
}
```

| HTTP | `code`                                                       | When                                                   |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------ |
| 400  | `validation_error`                                           | Malformed input                                        |
| 401  | `unauthorized`                                               | No valid session (the UI sends the user to sign in)    |
| 403  | `forbidden`                                                  | Not allowed (for example, a non-admin on admin routes) |
| 403  | `challenge_closed`                                           | Submissions are closed                                 |
| 404  | `not_found`                                                  | Unknown post or employee                               |
| 409  | `duplicate_post`                                             | The post was already submitted, by anyone              |
| 409  | `invalid_transition`                                         | That moderation action isn't allowed from this status  |
| 409  | `rounds_exist`                                               | Generating rounds when rounds of that kind exist       |
| 422  | `invalid_url`, `unsupported_platform`, `unsupported_content` | The link isn't a post we can count                     |
| 422  | `validation_error`                                           | A rule wasn't met (for example, a missing reason)      |
| 422  | `invalid_dates`, `outside_challenge`, `round_overlap`        | A round or challenge date range that can't be saved    |
| 429  | `rate_limited`                                               | Too many submissions, re-checks or syncs               |
| 5xx  | `service_unavailable`                                        | Anything else                                          |

## The boards

There are two independent leaderboards:

| Board      | Counts                                                | Score             |
| ---------- | ----------------------------------------------------- | ----------------- |
| **Video**  | TikTok videos, Instagram Reels, Facebook videos       | views + reactions |
| **Static** | LinkedIn posts, Facebook posts, Instagram photo posts | reactions         |

- **Reactions** are likes and reactions only (TikTok likes, Instagram likes, Facebook and
  LinkedIn total reactions). Comments, shares, saves and reposts never count.
- **Views** are TikTok plays, Instagram Reel plays and Facebook video views. Static posts always
  have `views: null`. If a video's views are hidden, `views` stays `null` (flag
  `metrics_unavailable`) and the post scores its reactions until an admin enters the number.
- **One entry per employee.** Their score is the sum of their approved posts' scores on that
  board, period and platform filter.
- **Only approved posts count.** Pending, rejected and disqualified posts never do.

### Periods

| `period` | Window                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------ |
| `week`   | The weekly round (admin-set dates); without weekly rounds, the ISO week, Monday to Monday        |
| `month`  | The monthly round (admin-set dates); without monthly rounds, the 1st to the next 1st             |
| `all`    | The challenge: the dates set in the admin panel, else `[CHALLENGE_STARTS_AT, CHALLENGE_ENDS_AT)` |

- **Rounds** are whole days in the campaign time zone: from 00:00 on `startDate` to 00:00 after
  `endDate`. Rounds of a kind never overlap and lie inside the challenge.
- Without `round`, `week`/`month` show the current round: the one covering now; before the first
  one, the first; between or after rounds, the last one that started. With `round=<id>`, that
  round (an unknown id falls back to the current one, and `query.round` is then `null`).
- Rounds, weeks and months are intersected with the challenge window. Posts published outside it
  never count anywhere.
- **A post belongs to the period containing its `publishedAt`** (when it was published on the
  platform), not when it was submitted or approved. It counts with its lifetime metrics as of the
  latest refresh.
- Without rounds, before the challenge starts `week`/`month` show its first period; after it ends,
  its last. Every response says which dates it covers (`period.start`, `period.end`,
  `period.isCurrent`) and which round it is (`period.round`, `null` for calendar periods and
  `all`).
- `publishedAt` comes from, in order: the data provider; the post ID (TikTok and LinkedIn encode
  the time); the submitter's optional `postedAt` (read as 12:00 in the campaign time zone, flag
  `published_date_uncertain`); an admin edit. The source is stored.

### Ranking

- Sort by score (descending), then total reactions (descending), then name. Ranks are unique.
- `search` filters entries after ranking: ranks aren't renumbered, and `totalParticipants` and
  `myStanding` ignore it.
- `previousRank` is the rank on the same board 24 hours ago (posts approved by then, metrics from
  the latest snapshot at or before then), or `null` if the employee wasn't ranked (shown as
  "New").
- `gapToNext` is the score gap to the entry directly above (`null` for #1).
- `topPost` is the employee's highest-scoring counted post (ties go to the most recent).
  `platforms` lists the distinct platforms of their counted posts.

## Types

```ts
type Platform = "instagram" | "facebook" | "tiktok" | "linkedin";
type ContentCategory = "video" | "static";
type ContentType =
  | "tiktok_video"
  | "instagram_reel"
  | "facebook_video" // video
  | "instagram_photo"
  | "facebook_post"
  | "linkedin_post"; // static
type PostStatus = "pending" | "approved" | "rejected" | "disqualified";
type CheckStatus = "queued" | "running" | "passed" | "failed" | "error";
type LeaderboardPeriod = "week" | "month" | "all"; // all = the 3-month challenge
type PlatformFilter = Platform | "all";
type ModerationReason =
  | "missing_tag"
  | "not_owner"
  | "outside_challenge"
  | "duplicate"
  | "unavailable"
  | "rule_violation"
  | "spam"
  | "fake_engagement"
  | "other";
type PostFlag =
  | "suspicious_growth"
  | "unavailable"
  | "metrics_unavailable"
  | "tag_removed"
  | "author_mismatch" // retired: no longer raised
  | "handle_claimed_by_other" // retired: no longer raised
  | "category_reclassified"
  | "published_date_uncertain";

interface Employee {
  // Public: never includes the email.
  id: string;
  name: string; // "First Last" when known, else the display name
  firstName: string | null;
  lastName: string | null;
  department: string;
  avatarUrl: string | null; // /api/v1/employees/{id}/photo?v={etag}, or null (initials)
}
interface Me extends Employee {
  email: string;
  role: "employee" | "admin";
}

interface PostCheck {
  status: CheckStatus;
  tagFound: boolean | null;
  matched: string[]; // e.g. ["#crocobysquad"]
  authorHandle: string | null;
  ownerMatch: boolean | null;
  publishedInWindow: boolean | null;
  error:
    | "not_found"
    | "private"
    | "rate_limited"
    | "unsupported"
    | "provider_error"
    | null;
  checkedAt: IsoDateTime | null;
}

interface Post {
  id: string;
  employeeId: string;
  url: string; // canonical
  platform: Platform;
  contentType: ContentType;
  category: ContentCategory;
  title: string | null; // the submitter's title, else the caption's first line (max 120)
  publishedAt: IsoDateTime | null;
  submittedAt: IsoDateTime;
  status: PostStatus;
  statusReason: ModerationReason | null;
  statusNote: string | null; // the admin's note; shown to the owner word for word
  check: PostCheck;
  views: number | null; // null on static content or when unavailable
  reactions: number;
  score: number;
  metricsUpdatedAt: IsoDateTime | null;
  thumbnailUrl: string | null;
}

interface LeaderboardQuery {
  category: ContentCategory;
  platform: PlatformFilter; // only platforms on that board
  period: LeaderboardPeriod;
  round: string | null; // a round of that period's kind; null = the current one
  search: string;
}
interface LeaderboardEntry {
  rank: number;
  previousRank: number | null;
  employee: Employee;
  postCount: number;
  totalViews: number | null; // null on the static board
  totalReactions: number;
  score: number;
  platforms: Platform[];
  topPost: Pick<
    Post,
    "id" | "url" | "platform" | "contentType" | "views" | "reactions" | "score"
  >;
}
interface LeaderboardResponse {
  query: LeaderboardQuery;
  // The dates are computed in timeZone (CAMPAIGN_TIMEZONE); end is exclusive.
  period: {
    start: IsoDateTime;
    end: IsoDateTime;
    isCurrent: boolean;
    round: RoundRef | null;
    timeZone: string;
  };
  entries: LeaderboardEntry[];
  totalParticipants: number;
  myStanding: { entry: LeaderboardEntry; gapToNext: number | null } | null;
  lastSyncedAt: IsoDateTime | null; // null before the first sync
}

interface BoardSummary {
  rank: number | null;
  totalParticipants: number;
  score: number;
  totalViews: number | null;
  totalReactions: number;
}
interface MyPostsResponse {
  posts: Post[]; // newest first, every status
  summary: {
    postCount: number;
    approvedCount: number;
    pendingCount: number;
    boards: Record<ContentCategory, BoardSummary>; // period "all"
  };
}

interface AdminPost extends Post {
  employee: Employee & { email: string };
  caption: string | null;
  authorName: string | null;
  flags: PostFlag[];
  metricsSource: "provider" | "manual";
  metricsLocked: boolean;
  publishedAtSource: "provider" | "post_id" | "submitter" | "admin" | null;
  reviewedBy: Pick<Employee, "id" | "name"> | null;
  reviewedAt: IsoDateTime | null;
}
interface AdminPostDetail extends AdminPost {
  snapshots: {
    fetchedAt: IsoDateTime;
    views: number | null;
    reactions: number | null;
    source: "provider" | "manual";
  }[];
  events: {
    id: string;
    at: IsoDateTime;
    actor: Pick<Employee, "id" | "name"> | null; // null = system
    action: string;
    reason: ModerationReason | null;
    note: string | null;
  }[];
  linkedHandles: { platform: Platform; handle: string; employeeId: string }[];
}
interface AdminPostsResponse {
  posts: AdminPost[];
  nextCursor: string | null;
  counts: Record<PostStatus | "flagged", number>;
}

interface BulkModerationResult {
  results: { id: string; ok: boolean; error: string | null }[]; // error = an error code
}
interface SyncRun {
  id: string;
  trigger: "cron" | "manual" | "submit";
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null; // null while running
  postsTotal: number;
  postsOk: number;
  postsFailed: number;
  error: string | null;
}
```

### Rounds and the challenge

```ts
type RoundKind = "week" | "month";
interface Round {
  id: string;
  kind: RoundKind;
  name: string | null; // null: the UI labels it "Week 3" or by month
  number: number; // 1-based among the rounds of its kind
  startsAt: IsoDateTime;
  endsAt: IsoDateTime; // exclusive
  startDate: IsoDate; // inclusive, in the campaign time zone
  endDate: IsoDate; // inclusive
}
type RoundRef = Pick<Round, "id" | "kind" | "name" | "number">;
interface ChallengeWindow {
  startsAt: IsoDateTime;
  endsAt: IsoDateTime; // exclusive
  startDate: IsoDate;
  endDate: IsoDate; // inclusive
  timeZone: string;
  source: "admin" | "default"; // set in the admin panel, or the server settings
}
interface RoundsResponse {
  challenge: ChallengeWindow;
  rounds: Round[]; // weekly, then monthly, each by start date
}
interface RoundInput {
  kind: RoundKind;
  name: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
}
```

### Admin queue

- `status` is one of the tabs: `pending`, `approved`, `rejected`, `disqualified`, or `flagged`
  (pending or approved posts with at least one flag). Each filter's `all` value is left out of the
  query string.
- Pending is oldest submission first; approved, rejected and disqualified show the latest
  decisions first; flagged is newest submission first. Pages hold 20 posts; pass `nextCursor` back
  as `cursor`.
- `counts` has every tab, with the other filters (check, flag, category, platform, `q`) applied.
- `q` matches the employee's name or email, the post's author handle, or any handle linked to the
  employee.

### Audit events

`ModerationEvent.action` is one of: `submitted`, `check_passed`, `check_failed`, `check_error`,
`approve`, `approve_override` (approved although the check didn't pass), `reject`, `disqualify`,
`reinstate`, `reopen`, `recheck`, `refresh`, `edit_metrics`, `edit_published_at`,
`edit_content_type`, `lock_metrics`, `unlock_metrics`, `reclassified`, and `flag:<PostFlag>` when the
system raises a flag. `actor` is `null` for the system.

## Endpoints

All paths are under `/api/v1` unless noted.

| Endpoint                                                                                            | Who             | Result                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`                                                                                           | employee        | `Me` (creates or updates the employee row)                                                                                                                                         |
| `GET /leaderboard?category=&platform=&period=&round=&search=`                                       | employee        | `LeaderboardResponse`. Defaults: `video`, `all`, `month`, current round, `""`                                                                                                      |
| `GET /rounds`                                                                                       | employee        | `RoundsResponse`                                                                                                                                                                   |
| `GET /me/posts`                                                                                     | employee        | `MyPostsResponse`                                                                                                                                                                  |
| `GET /employees/{id}/posts?category=&platform=&period=&round=`                                      | employee        | `Post[]`: the posts counted in that entry, highest score first                                                                                                                     |
| `GET /employees/{id}/photo`                                                                         | employee        | Image bytes, `Cache-Control: private, max-age=86400`, with an ETag                                                                                                                 |
| `POST /posts` `{url, title?, postedAt?}`                                                            | employee        | `201 Post` (`pending`, check `queued`). Errors: `409 duplicate_post`; `422 invalid_url \| unsupported_platform \| unsupported_content`; `403 challenge_closed`; `429 rate_limited` |
| `POST /posts/{id}/recheck`                                                                          | owner (pending) | `202`, or `429` within 10 minutes                                                                                                                                                  |
| `DELETE /posts/{id}`                                                                                | owner           | `204` (any status; removes it everywhere)                                                                                                                                          |
| `GET /admin/posts?status=&check=&flag=&category=&platform=&q=&cursor=`                              | admin           | `AdminPostsResponse`, oldest pending first                                                                                                                                         |
| `GET /admin/posts/{id}`                                                                             | admin           | `AdminPostDetail`                                                                                                                                                                  |
| `PATCH /admin/posts/{id}` `{views?, reactions?, metricsLocked?, publishedAt?, contentType?, note?}` | admin           | `AdminPostDetail` (audited)                                                                                                                                                        |
| `DELETE /admin/posts/{id}`                                                                          | admin           | `204`: removes the post entirely, with its snapshots and events                                                                                                                    |
| `POST /admin/posts/{id}/{approve\|reject\|disqualify\|reinstate\|reopen}` `{reason?, note?}`        | admin           | `AdminPostDetail`, or `409 invalid_transition`                                                                                                                                     |
| `POST /admin/posts/{id}/refresh`                                                                    | admin           | `202`                                                                                                                                                                              |
| `POST /admin/posts/bulk` `{ids, action, reason?, note?}`                                            | admin           | `BulkModerationResult`, one result per ID (each runs the same rules as the single action)                                                                                          |
| `GET /admin/export?category=&period=&round=&periodStart=&asOf=`                                     | admin           | `text/csv` standings (rank, name, email, department, posts, views, reactions, score, post URLs) for a round, or the week or month containing `periodStart`, as of `asOf`           |
| `POST /admin/rounds` `RoundInput`                                                                   | admin           | `201 Round`. Errors: `422 invalid_dates \| outside_challenge \| round_overlap`                                                                                                     |
| `PATCH /admin/rounds/{id}` `{name?, startDate?, endDate?}`                                          | admin           | `Round`, with the same errors                                                                                                                                                      |
| `DELETE /admin/rounds/{id}`                                                                         | admin           | `204`                                                                                                                                                                              |
| `POST /admin/rounds/generate` `{kind}`                                                              | admin           | `201 RoundsResponse`: 7-day weeks from the challenge start, or calendar months. `409 rounds_exist` if that kind has rounds                                                         |
| `PUT /admin/challenge` `{startDate, endDate}`                                                       | admin           | `ChallengeWindow` (inclusive dates; overrides `CHALLENGE_STARTS_AT`/`CHALLENGE_ENDS_AT`). `422 invalid_dates`                                                                      |
| `GET /admin/sync`, `POST /admin/sync`                                                               | admin           | `{runs: SyncRun[]}` (newest first), or start a run now: `202 SyncRun`, `429` within 15 minutes of the last manual run                                                              |
| `GET /api/cron/refresh-metrics` (not under v1)                                                      | Vercel Cron     | Requires `Authorization: Bearer $CRON_SECRET`, otherwise `401`                                                                                                                     |

## Submissions and links

Accepted links, after normalization (https, no `www.`/`m.`, no trailing slash, tracking
parameters dropped). The canonical rules are in [`lib/platforms.ts`](lib/platforms.ts) and tested
in [`lib/platforms.test.ts`](lib/platforms.test.ts).

| Platform  | Links                                                                                                                                                 | Content type      | Board   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| TikTok    | `/@{user}/video/{id}`; short links `vm.tiktok.com/…`, `vt.tiktok.com/…`, `tiktok.com/t/…` (resolved on the server)                                    | `tiktok_video`    | video   |
| Instagram | `/reel/{code}`, `/reels/{code}`, `/tv/{code}`                                                                                                         | `instagram_reel`  | video   |
| Instagram | `/p/{code}`                                                                                                                                           | `instagram_photo` | static¹ |
| Facebook  | `/reel/{id}`, `/watch?v={id}`, `/{page}/videos/[slug/]{id}`, `/share/v/…`, `/share/r/…`, `fb.watch/…`                                                 | `facebook_video`  | video   |
| Facebook  | `/{user}/posts/{id \| pfbid…}`, `/permalink.php?story_fbid=&id=`, `/story.php?story_fbid=&id=`, `/photo?fbid=`, `/{page}/photos/…/{id}`, `/share/p/…` | `facebook_post`   | static¹ |
| LinkedIn  | `/posts/{slug}`, `/feed/update/urn:li:(activity\|ugcPost\|share):{id}`                                                                                | `linkedin_post`   | static  |

¹ If the data provider reports that it's really a video, it moves to the video board
(`instagram_reel` or `facebook_video`, flag `category_reclassified`). LinkedIn always stays
static.

Stories, profiles, feeds and TikTok photo posts are rejected with `unsupported_content`.
Duplicates are caught on (`platform`, the post's ID) when the link contains it, else on the
canonical URL. Short links are resolved first.

## Checks, moderation and refresh

- **The automated check** looks for `#CrocoBySquad` or a Croco Squad tag (either is enough), reads the author handle,
  and checks whether the post was published inside the challenge. It's evidence for the admin;
  nothing is approved automatically. Account ownership isn't judged automatically: admins decide
  it when they approve.
- **Moderation:**

  | From         | Action     | To           | Who            | Requires                                      |
  | ------------ | ---------- | ------------ | -------------- | --------------------------------------------- |
  | pending      | approve    | approved     | admin          | Any check result (the check is evidence only) |
  | pending      | reject     | rejected     | admin          | A reason code (note optional)                 |
  | approved     | disqualify | disqualified | admin          | A reason code and a note                      |
  | disqualified | reinstate  | approved     | admin          | A note                                        |
  | rejected     | reopen     | pending      | admin          | —                                             |
  | any          | withdraw   | (deleted)    | owner          | — (admins can also delete any post)           |
  | pending      | recheck    | pending      | owner or admin | Owner: at most once every 10 minutes          |

  Any other transition is `409 invalid_transition`. Every admin action is audited and takes
  effect on every board immediately.

- **Metrics refresh twice a day** (12:00 and 23:59 Tbilisi time) for pending and approved posts,
  until `CHALLENGE_ENDS_AT + METRICS_GRACE_DAYS`. Every fetch is stored as a snapshot. A failed
  fetch keeps the last values; three in a row flag the post `unavailable`. Approved posts that
  lose their tag are flagged `tag_removed`, never disqualified automatically. Admins can override
  and lock the numbers.
