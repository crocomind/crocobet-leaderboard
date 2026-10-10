# Croco by Squad — implementation brief for the coding agent

You are extending **Croco by Squad**, a working Next.js 16 app in this repository, into the
**Croco by Squad** leaderboard: employees post on social media with **#CrocoBySquad** (or tag
**@Croco Squad**), submit the link, admins approve it, and approved posts are ranked on two
independent leaderboards (Video content and Static content) by week, month and the 3-month
challenge.

The frontend exists and runs on a typed mock API. Microsoft Entra ID sign-in exists. **The
backend does not exist yet; you build it in this repo.** This is an extension, not a rewrite.

Read this whole brief first, then the files in §2, before changing anything. When this brief and
the code disagree, the code decides _how_ (patterns, conventions) and this brief decides _what_
(behavior). Point out any conflict you find.

---

## 0. Ground rules

1. **Keep what exists.** Don't rewrite or restyle working parts. Extend the existing mechanisms:
   the adapter pattern (`ApiAdapter`), URL state, i18n dictionaries, design tokens, the motion
   system, the UI primitives in `components/ui/`, and the auth setup. The only auth changes
   allowed are the ones in §6.4.
2. **Mock mode must keep working.** `NEXT_PUBLIC_USE_MOCKS=true` runs the whole app, including
   the new admin panel, with no database and no network.
3. **Shared pure logic.** Scoring, periods, tag matching, ranking and moderation rules are pure
   TypeScript modules in `lib/`, used by both the mock adapter and the server. That keeps mock and
   real behavior identical. Unit-test all of them.
4. **Quality gates stay green after every phase:** `npm run lint`, `npm run typecheck`,
   `npm test`, `npm run build`, `npm run format:check`. Today: 155 tests passing, 0 lint or type
   errors. When the spec changes a behavior, update that test on purpose and say so in the commit.
   Never delete a test just to make the suite pass.
5. **Dependencies.** Allowed new ones: `drizzle-orm`, `drizzle-kit`, `postgres`,
   `@electric-sql/pglite` (dev, for tests), a time-zone helper (for example `@date-fns/tz`), and
   the chosen data provider's SDK if it has one. Justify anything else. No chart or UI libraries:
   draw small charts as inline SVG.
6. **Git.** Work on a branch off `dev` (the default branch is `master`). Commit at the end of each
   phase using the repo's style (`feat(scope): …`, `fix(scope): …`). Ask before you push, deploy,
   open a PR, or run migrations against any non-local database.
7. **Local servers.** The user often has `next dev` running on **:3000**. Run yours on another
   port (for example 3100). Stop only the server you started, found by its port. Never kill
   processes by name.
8. **Translations.** Every new string goes into both `en` and `ka` in
   `lib/i18n/dictionaries.ts`. Mark the Georgian strings as needing native review in your final
   summary.
9. **Ask only when you're blocked** on the open inputs in §11, or before an action that's
   destructive or visible outside the repo. Otherwise decide, write the decision down, and keep
   going.

---

## 1. Product goal (the source requirements, made precise)

| #   | Requirement                                                                                                                                                                                 | Where it's specified |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| R1  | Two independent leaderboards: **Video** (TikTok, Instagram Reels, Facebook Video), score = views + reactions; **Static** (LinkedIn post, Facebook post, Instagram photo), score = reactions | §4.1, §4.2           |
| R2  | Employees submit a direct link to their post                                                                                                                                                | §5, §7.6             |
| R3  | The system checks for #CrocoBySquad or @Croco Squad and fetches views and reactions automatically                                                                                           | §4.4, §6.5           |
| R4  | Metrics of active posts refresh **twice a day**                                                                                                                                             | §4.7, §6.6           |
| R5  | Weekly, monthly and overall (3-month challenge) boards. A post counts in the week and month it was **originally published**                                                                 | §4.3                 |
| R6  | HR and admins approve or disqualify posts (rule violations, spam, fake engagement)                                                                                                          | §4.6, §8             |
| R7  | Filter bar: content category (Video / Static) and period (This week / This month / 3-Month Challenge)                                                                                       | §7.3                 |
| R8  | Each entry shows first and last name, photo, platform logos, a direct post link, views and reactions, total score and rank; #1–#3 get badges                                                | §7.4, §6.4           |

---

## 2. What already exists (read these files; don't rebuild them)

- **Stack:** Next.js 16 App Router (with `proxy.ts`, which replaces middleware), React 19, strict
  TypeScript (`noUncheckedIndexedAccess`), Tailwind v4, Radix/shadcn-style primitives, Motion,
  TanStack Query, React Hook Form + Zod, Better Auth, Vitest, ESLint + Prettier. Node ≥ 22.12.
  Deployed on Vercel (team "BE") at `leaderboard.crocomind.com`.
- **One route, client-side views.** Everything lives on `/`. The view and filters are in the URL
  (`lib/url-state.ts`, `lib/hooks/use-app-url-state.ts`): views use `pushState`, filters use
  `replaceState`, and parameters left at their defaults are omitted.
- **Data layer.** Components call TanStack hooks in `lib/api/queries.ts`. Those call
  `lib/api/index.ts`, which picks `mockAdapter` (lazy-loaded) or `httpAdapter`. Both implement
  `ApiAdapter` in `lib/api/types.ts`. `lib/api/http-client.ts` does the JSON transport, maps the
  error body `{ error: { code, message } }` to `ApiError` codes, and on a 401 redirects to
  `/sign-in?returnTo=…`. `message` is never shown in the UI.
- **Mock backend:** `lib/api/mock/` (seeded data, localStorage submissions, simulated latency and
  errors, ranking in `mock/ranking.ts`).
- **Platforms:** `lib/platforms.ts` is the single source for platform id, name, icon, colors,
  hosts, accepted link patterns, normalization (`analyzeVideoUrl`) and `safeExternalUrl`. Its
  tests are in `lib/platforms.test.ts`.
- **Validation:** `lib/validation/submit-video.ts` returns error _codes_, and the UI translates
  them.
- **Auth:** `lib/auth/*` and `proxy.ts`. Better Auth runs in stateless mode (JWE cookies, no
  database) against a single-tenant Entra app. `lib/auth/policy.ts` (pure and tested) checks the
  tenant, the audience and the `@crocobet.com` domain. `proxy.ts` redirects signed-out pages to
  `/sign-in` and answers `/api/*` (except `/api/auth`) with a JSON 401. `getSessionUser()` serves
  server components. `CurrentUserProvider` merges the session identity with `GET /me`.
- **Design and motion:** `styles/tokens.css` is the only file with colors. `app/globals.css`
  holds the utilities and radii. `lib/motion.ts` mirrors the CSS motion tokens. Only transform
  and opacity animate, hover effects only on fine pointers, reduced motion is respected, and
  buttons use `MotionButton`.
- **i18n:** `lib/i18n/dictionaries.ts` (`en` is the source of truth and `ka` must match its shape,
  which TypeScript enforces). Georgian number and date formatting is in `lib/i18n/format.ts` (no
  `Intl` for `ka`).
- **Existing UI:** leaderboard (toolbar, podium with gold/silver/bronze medals and a crown on #1,
  ranked list, employee side sheet, pinned "my standing" bar), My Videos (summary cards, status
  cards), and the submit dialog (live platform detection, preview, success animation).
- **QA helpers from earlier sessions:** `~/.cache/croco-creators-qa/` has a mock Entra server
  (`mock-entra.mjs`) and Playwright scripts (`qa-auth.cjs`, …) for signing in locally. Reuse them.

---

## 3. Settled decisions (don't re-ask)

| Topic          | Decision                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ranking unit   | **One entry per employee.** Score = sum of their approved posts' scores in that category, period and platform filter. The entry shows the platforms used and a link to their top post. The side sheet lists every counted post.      |
| Backend        | **In this repo:** Next.js Route Handlers under `/api/v1`, Supabase Postgres (already provisioned), Vercel Cron. Authenticated with the same-origin session cookie; no Entra API scope or Bearer token needed.                        |
| Metrics source | **A third-party public-data provider** behind a pluggable `PostDataProvider` interface, plus **manual admin entry and override** as the fallback. Employees don't link their social accounts.                                        |
| Moderation     | **Admins approve every post** (pre-moderation). The automated tag check is evidence for the admin, not an auto-approval. Only approved posts count. Admins can disqualify approved posts at any time.                                |
| Admins         | `ADMIN_EMAILS` (comma-separated env var) or `employees.role = 'admin'`. Enforced on the server for every admin endpoint.                                                                                                             |
| Naming         | Rename the domain **Video → Post** (types, API paths, i18n copy, error codes) now, while no backend depends on the old names. Do it as the first, behavior-neutral commit. Keep `?view=my-videos` working as an alias of `my-posts`. |
| Period values  | Keep `week \| month \| all` in the URL and API. `all` means the 3-month challenge window and is labeled "3-Month Challenge".                                                                                                         |
| App name       | Croco by Squad (decided; was "Croco Creators").                                                                                                                                                                              |

---

## 4. Domain rules

### 4.1 Content classification (extend `lib/platforms.ts`)

Rename `analyzeVideoUrl` to `analyzePostUrl` and have it also return `contentType`, `category`
and, when the URL contains it, `externalId`.

| Platform  | Accepted links (after normalization)                                                                                                                                            | `contentType`     | `category` |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| TikTok    | `tiktok.com/@{user}/video/{id}`. Short links `vm.tiktok.com/…`, `vt.tiktok.com/…`, `tiktok.com/t/…` (resolved on the server, §6.5)                                              | `tiktok_video`    | video      |
| Instagram | `instagram.com/reel/{code}`, `/reels/{code}`, `/tv/{code}`                                                                                                                      | `instagram_reel`  | video      |
| Instagram | `instagram.com/p/{code}`                                                                                                                                                        | `instagram_photo` | static\*   |
| Facebook  | `/reel/{id}`, `/watch?v={id}`, `/{page}/videos/[slug/]{id}`, `/share/v/…`, `/share/r/…`, `fb.watch/…`                                                                           | `facebook_video`  | video      |
| Facebook  | `/{user}/posts/{id \| pfbid…}`, `/permalink.php?story_fbid=…&id=…`, `/story.php?story_fbid=…&id=…`, `/photo?fbid=…`, `/photo.php?fbid=…`, `/{user}/photos/…/{id}`, `/share/p/…` | `facebook_post`   | static\*   |
| LinkedIn  | `/posts/{slug}`, `/feed/update/urn:li:(activity\|ugcPost\|share):{id}`                                                                                                          | `linkedin_post`   | static     |

- \* **Reclassification:** if the provider reports that an Instagram `/p/` link or a Facebook post
  is really a video, switch it to `instagram_reel` or `facebook_video` (category video), add the
  flag `category_reclassified` and record a system event. LinkedIn always stays static, because
  the spec lists LinkedIn only under static.
- TikTok photo posts (`/@user/photo/…`), Instagram stories, profiles and feeds are rejected with
  the new status `unsupported-content` (API code `unsupported_content`).
- **Keep params per pattern.** Facebook needs `v`, `story_fbid`, `id` and `fbid` on the patterns
  that use them. Everything else (tracking) is still dropped.
- **Flip these tests on purpose:** `facebook.com/{page}/photos/{id}` and `facebook.com/share/p/…`
  are rejected today and become valid `facebook_post` links. Add positive and negative cases for
  every new pattern.
- Export `CATEGORY_PLATFORMS` (video: tiktok, instagram, facebook; static: linkedin, facebook,
  instagram) so filters can use it.

### 4.2 Scoring (`lib/scoring.ts`)

```
postScore(category, views, reactions) =
  category === "video" ? (views ?? 0) + reactions
                       : reactions
```

- **`reactions` means likes and reactions only:** TikTok likes, Instagram likes, Facebook total
  reactions (all types), LinkedIn total reactions (all types). Comments, shares, saves and reposts
  never count. Store them only in the raw snapshot.
- **`views`:** TikTok plays, Instagram Reel views or plays, Facebook video views. On static
  content the API returns `views: null`; any views the provider reports go to the raw snapshot only.
- If a video's views are unavailable (some platforms hide them), keep `views: null`, flag
  `metrics_unavailable`, and let the admin enter the number. Until then it scores reactions only.
- Employee score = sum of post scores. `totalViews` is `null` on the static board.
- This replaces the mock's `views + 10 × reactions`. Remove `LeaderboardMetric` and the
  "rank by" metric selector entirely.

### 4.3 Periods and eligibility (`lib/periods.ts`)

- Every period is computed in `CAMPAIGN_TIMEZONE` (default `Asia/Tbilisi`), never in the server's
  local time. Vercel runs in UTC, and `toIsoDate()` in `lib/utils.ts` uses local time, so don't
  use it on the server.
- **week:** ISO week, Monday 00:00 to the next Monday 00:00. **month:** the 1st at 00:00 to the
  next 1st. **all:** `[CHALLENGE_STARTS_AT, CHALLENGE_ENDS_AT)`.
- Week and month windows are **intersected with the challenge window**. Posts published outside
  the challenge never count anywhere.
- **A post belongs to the period that contains its `publishedAt`** (when it was published on the
  platform), never its submission or approval time. It counts with its lifetime metrics as of the
  latest refresh; engagement isn't split over time.
- **Where `publishedAt` comes from, in order:**
  1. the provider;
  2. decoded from the post ID (TikTok: `id >> 32` = Unix seconds; LinkedIn activity or ugcPost
     ID: the top 41 of 64 bits = Unix ms; verify both against real sample IDs in tests);
  3. the submitter's optional `postedAt` (a date, read as 12:00 in the campaign time zone), with
     the flag `published_date_uncertain`;
  4. an admin edit.

  Store the source.

- When "now" is outside the challenge window, week and month resolve to the first period inside
  the window (before it starts) or the last one (after it ends). The response says which dates it
  covers (`period.start`, `period.end`, `period.isCurrent`).
- **Submissions** are accepted until `CHALLENGE_ENDS_AT + SUBMISSION_GRACE_DAYS` (default 3).
  After that the API answers `403 challenge_closed`.
- **Metric refreshes** continue until `CHALLENGE_ENDS_AT + METRICS_GRACE_DAYS` (default 3). After
  that the values are final.
- Test the boundaries: Sunday 23:59:59 versus Monday 00:00 in Tbilisi, month ends, challenge
  start and end, and posts whose `publishedAt` is unknown.

### 4.4 Campaign tag check (`lib/campaign-tag.ts`)

- Configuration (§9): `CAMPAIGN_HASHTAGS` (default `CrocoBySquad`) and the accepted Croco Squad
  mentions for each platform (`CAMPAIGN_MENTIONS`: handles for Instagram and TikTok, page display
  names for Facebook and LinkedIn).
- Normalize with NFKC and compare case-insensitively.
- A **hashtag** matches as a whole token, so `#CrocoBySquad`, `#crocobysquad` and
  `#CrocoBySquad!` match and `#CrocoBySquadFun` doesn't. Check both the caption text and the
  provider's structured hashtag list.
- A **mention** matches as an `@handle` token in the caption, or in the provider's
  mentions, tagged users or collaborators. For Facebook and LinkedIn it also matches the page
  name as a whole phrase (whitespace collapsed).
- The check **passes** if any hashtag or any mention matches. The result records what matched.
- Also record `publishedInWindow` and the owner check (§4.5). All of this is evidence for the
  admin; nothing is approved automatically.

### 4.5 Post ownership (fraud signal)

- Store the post's author handle (lowercase, no `@`) and display name from the provider.
- A `social_accounts (employee_id, platform, handle)` table links handles to employees. The
  first **approved** post on a platform links its handle to the employee.
- Flags: `author_mismatch` (the post comes from a handle the employee hasn't linked on that
  platform), `handle_claimed_by_other` (the handle is linked to a different employee).
- Both flags are advisory: the admin sees them and decides.

### 4.6 Moderation state machine (`lib/moderation.ts`, pure and tested)

| From         | Action     | To                          | Who            | Requires                                        |
| ------------ | ---------- | --------------------------- | -------------- | ----------------------------------------------- |
| pending      | approve    | approved                    | admin          | Check `passed`, or `override: true` plus a note |
| pending      | reject     | rejected                    | admin          | A reason code (plus an optional note)           |
| approved     | disqualify | disqualified                | admin          | A reason code (plus a note)                     |
| disqualified | reinstate  | approved                    | admin          | A note                                          |
| rejected     | reopen     | pending                     | admin          | —                                               |
| pending      | withdraw   | (deleted)                   | owner          | —                                               |
| pending      | recheck    | pending (the check re-runs) | owner or admin | Owner: at most once every 10 minutes            |

- **Reason codes:** `missing_tag`, `not_owner`, `outside_challenge`, `duplicate`, `unavailable`,
  `rule_violation`, `spam`, `fake_engagement`, `other`. The owner sees the reason translated plus
  the admin's note word for word. The admin UI must say the note is visible to the employee.
- Any other transition returns `409 invalid_transition`.
- Every admin action writes a `moderation_events` row with the actor, action, reason, note and the
  before and after values.
- Approve, disqualify and reinstate take effect on all boards immediately.

### 4.7 Metric refresh, snapshots and flags

- **Active posts:** status `pending` or `approved`, published inside the window (or not yet
  known), and now earlier than `CHALLENGE_ENDS_AT + METRICS_GRACE_DAYS`.
- Every successful fetch writes a `post_metric_snapshots` row and updates the post's latest values.
  If `metrics_locked` is on (a manual override), the latest values stay as entered, but the
  snapshot is still recorded for audit.
- Each refresh re-runs the tag check. If an approved post has lost its tag, flag `tag_removed`.
  Never disqualify automatically.
- **On a failed fetch**, keep the last good values and increment `consecutive_fetch_failures`.
  At 3 or more, flag `unavailable` (the post may have been deleted or made private).
- **`suspicious_growth` flag:** between two consecutive snapshots, views or reactions grew by more
  than both `GROWTH_FLAG_FACTOR` (default ×5) and `GROWTH_FLAG_MIN` (default 1,000). Advisory only.

### 4.8 Ranking (`lib/ranking.ts`, replaces `lib/api/mock/ranking.ts`)

- A board is the combination of category, platform filter and period. It counts only
  **approved** posts in that category and platform whose `publishedAt` falls in the period.
- Only employees with at least one counted post are ranked. Sort by score (descending), then total
  reactions (descending), then name (ascending). Ranks are unique and contiguous, as today.
- `search` filters entries **after** ranking. Ranks aren't renumbered, and `totalParticipants` and
  `myStanding` ignore the search (as today).
- `gapToNext` is the score gap to the entry directly above (`null` for #1).
- **`previousRank`** is the rank on the same board as of 24 hours ago. Use the posts approved by
  then and each post's latest snapshot taken at or before that time. It's `null` if the employee
  wasn't ranked then (the UI shows "New"). Relabel the arrows "since yesterday".
- `topPost` is the employee's highest-scoring counted post (ties go to the most recent).
  `platforms` lists the distinct platforms of their counted posts, in `PLATFORM_IDS` order.
- **The server loads the counted posts with one query and ranks them with the same `rankBoard()`
  the mock uses.** At about 300 employees that's cheap, and mock and server can't drift apart.

---

## 5. API contract v1

Rewrite `API_CONTRACT.md` to match. Everything below is under `/api/v1`, same origin, and
authenticated by the session cookie. The JSON conventions and the error envelope stay the same.

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
  | "author_mismatch"
  | "handle_claimed_by_other"
  | "category_reclassified"
  | "published_date_uncertain";

interface Employee {
  // public: no email on leaderboard payloads
  id: string;
  name: string; // "First Last" when known, else the display name
  firstName: string | null;
  lastName: string | null;
  department: string;
  avatarUrl: string | null; // /api/v1/employees/{id}/photo?v={etag}, or null (initials fallback)
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
  statusNote: string | null; // the admin's note; shown to the owner
  check: PostCheck;
  views: number | null; // null on static content or when unavailable
  reactions: number;
  score: number;
  metricsUpdatedAt: IsoDateTime | null;
  thumbnailUrl: string | null;
}

interface LeaderboardQuery {
  category: ContentCategory;
  platform: PlatformFilter; // only platforms in CATEGORY_PLATFORMS[category]
  period: LeaderboardPeriod;
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
  period: { start: IsoDateTime; end: IsoDateTime; isCurrent: boolean };
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
    actor: Pick<Employee, "id" | "name"> | null;
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
```

| Endpoint                                                                                                | Who             | Result                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`                                                                                               | employee        | `Me` (creates or updates the employee row)                                                                                                                                         |
| `GET /leaderboard?category=&platform=&period=&search=`                                                  | employee        | `LeaderboardResponse`. Defaults: `video`, `all`, `month`, `""`                                                                                                                     |
| `GET /me/posts`                                                                                         | employee        | `MyPostsResponse`                                                                                                                                                                  |
| `GET /employees/{id}/posts?category=&platform=&period=`                                                 | employee        | `Post[]`: the posts counted in that entry, highest score first                                                                                                                     |
| `GET /employees/{id}/photo`                                                                             | employee        | Image bytes, `Cache-Control: private, max-age=86400`, with an ETag                                                                                                                 |
| `POST /posts` `{url, title?, postedAt?}`                                                                | employee        | `201 Post` (`pending`, check `queued`). Errors: `409 duplicate_post`; `422 invalid_url \| unsupported_platform \| unsupported_content`; `403 challenge_closed`; `429 rate_limited` |
| `POST /posts/{id}/recheck`                                                                              | owner (pending) | `202`, or `429` within 10 minutes                                                                                                                                                  |
| `DELETE /posts/{id}`                                                                                    | owner (pending) | `204`                                                                                                                                                                              |
| `GET /admin/posts?status=&check=&flag=&category=&platform=&q=&cursor=`                                  | admin           | `AdminPostsResponse`, oldest pending first                                                                                                                                         |
| `GET /admin/posts/{id}`                                                                                 | admin           | `AdminPostDetail`                                                                                                                                                                  |
| `PATCH /admin/posts/{id}` `{views?, reactions?, metricsLocked?, publishedAt?, contentType?, note?}`     | admin           | `AdminPostDetail` (audited)                                                                                                                                                        |
| `POST /admin/posts/{id}/{approve\|reject\|disqualify\|reinstate\|reopen}` `{reason?, note?, override?}` | admin           | `AdminPostDetail`, or `409 invalid_transition`                                                                                                                                     |
| `POST /admin/posts/{id}/refresh`                                                                        | admin           | `202`                                                                                                                                                                              |
| `POST /admin/posts/bulk` `{ids, action, reason?, note?}`                                                | admin           | A result per ID                                                                                                                                                                    |
| `GET /admin/export?category=&period=&periodStart=&asOf=`                                                | admin           | `text/csv` standings (rank, name, email, department, posts, views, reactions, score, post URLs) for any week or month, computed from snapshots as of `asOf`                        |
| `GET /admin/sync`, `POST /admin/sync`                                                                   | admin           | The last sync runs, or start one now                                                                                                                                               |
| `GET /api/cron/refresh-metrics` (not under v1)                                                          | Vercel Cron     | Requires `Authorization: Bearer $CRON_SECRET`, otherwise `401`                                                                                                                     |

- **New error codes:** `duplicate_post` (replaces `duplicate_video`), `unsupported_content`,
  `challenge_closed` and `invalid_transition`. Add them to `ApiErrorCode` and to `KNOWN_CODES` in
  `http-client.ts`.
- `forbidden` (403) is what non-admins get from admin endpoints.

---

## 6. Backend (in this repo)

### 6.1 Layout

```
app/api/v1/**/route.ts          thin handlers: parse (zod) → service → JSON
app/api/cron/refresh-metrics/route.ts
lib/server/db/{client,schema}.ts
lib/server/auth.ts              requireEmployee(), requireAdmin()
lib/server/http.ts              json(), apiError(), parseBody/parseQuery, same-origin check
lib/server/services/            submissions, moderation, leaderboard, sync, profile, export
lib/server/providers/           types, index (selection), fixture, manual, <third-party>
lib/server/link-resolver.ts     short-link resolution with an SSRF guard
lib/{scoring,periods,campaign-tag,ranking,moderation}.ts   shared pure logic (client and server)
drizzle/  drizzle.config.ts  vercel.json
```

Every module under `lib/server/**` starts with `import "server-only"`.

### 6.2 Database (Supabase Postgres, Drizzle)

- Connect with `drizzle-orm` and `postgres` via `DATABASE_URL`: Supabase's **transaction pooler**
  on port 6543, with `prepare: false`. Commit the migrations in `drizzle/` and add
  `db:generate` and `db:migrate` scripts.
- **Enable RLS on every table and add no policies.** That blocks access through PostgREST with
  the publishable key. The server connects as the database role. Don't use Supabase Auth.
- **Tables** (with `created_at` and `updated_at` where useful):
  - `employees`: `id` uuid, `entra_oid` (unique, nullable), `email` (unique, lowercase),
    `display_name`, `given_name`, `family_name`, `department`, `role`
    (`employee | admin`), `profile_synced_at`.
  - `employee_photos`: `employee_id` (primary key), `content_type`, `bytes` (bytea), `etag`,
    `updated_at`. Photos stay behind auth; don't put them in a public bucket.
  - `social_accounts`: `employee_id`, `platform`, `handle`, `linked_at`, unique on
    (`platform`, `handle`).
  - `posts`: `id`, `employee_id`, `platform`, `content_type`, `category`, `url_submitted`,
    `url_canonical`, `external_id`, a **unique key on (`platform`, `external_id`)** (fall back to
    unique `url_canonical`), `title`, `caption`, `author_handle`, `author_name`, `published_at`,
    `published_at_source`, `submitted_postedAt` (date), `status`, `status_reason`,
    `status_note`, `reviewed_by`, `reviewed_at`, `approved_at`, `check_status`, `check_details`
    (jsonb), `checked_at`, `views`, `reactions`, `metrics_source`, `metrics_locked`,
    `metrics_fetched_at`, `consecutive_fetch_failures`, `flags` (text[]), `thumbnail_url`.
    Index (`status`, `category`, `published_at`) and (`employee_id`).
  - `post_metric_snapshots`: `id`, `post_id`, `fetched_at`, `views`, `reactions`, `source`,
    `raw` (trimmed jsonb). Index (`post_id`, `fetched_at desc`).
  - `moderation_events`: `id`, `post_id`, `actor_id` (null for system), `action`, `reason`,
    `note`, `before` (jsonb), `after` (jsonb), `created_at`.
  - `sync_runs`: `id`, `trigger` (`cron | manual | submit`), `started_at`, `finished_at`,
    `posts_total`, `posts_ok`, `posts_failed`, `error`.
- `lastSyncedAt` is the `finished_at` of the latest successful run.

### 6.3 Security

- Every `/api/v1` handler calls `requireEmployee()` itself, even though `proxy.ts` already
  returns 401. Admin handlers call `requireAdmin()` (403).
- Validate every input with Zod and answer with the existing error envelope.
- For `POST`, `PATCH` and `DELETE`, reject requests whose `Origin` doesn't match the app origin.
  That's defense in depth on top of the `SameSite=Lax` cookies.
- **SSRF:** never fetch a user-supplied URL directly. The link resolver follows at most 5
  redirects with `redirect: "manual"`. Every hop must be `https`, on a host in the platform
  allowlist, and not an IP literal or localhost. It has a 5-second timeout and reads headers only.
- Secrets (`DATABASE_URL`, the provider token, `CRON_SECRET`) are server-only and never
  `NEXT_PUBLIC_`. Compare secrets in constant time.
- Rate limits, counted in the database: 20 submissions per employee per day, 1 recheck per post
  per 10 minutes, and manual syncs limited to 1 every 15 minutes.

### 6.4 Auth integration (additive changes only)

- `requireEmployee(request)`: get the session with `getAuth().api.getSession({ headers })`,
  check `isAllowedEmail` again, create or update the `employees` row, and return the employee and
  whether they're an admin.
- **Employee key:** the Entra `oid`. Put it on the session user through a Better Auth user
  `additionalFields` entry filled in `getUserInfo` (`lib/auth/server.ts`), and verify that it
  survives the stateless JWE cookie. If it doesn't, fall back to the lowercase email and store the
  oid when it's known. **Don't key employees on Better Auth's `user.id`**: without a database it
  isn't guaranteed to stay the same between sign-ins (verify this).
- **Profile and photo for R8:** add the Graph scope `User.Read` to the Microsoft scopes. In
  `getUserInfo`, where the Microsoft access token is available, schedule a sync with
  `after()` from `next/server`:
  - `GET https://graph.microsoft.com/v1.0/me?$select=givenName,surname,department`
  - `GET /me/photos/120x120/$value` (a 404 means there's no photo)

  Then update `employees` and `employee_photos`. Sync at most every 7 days, with 3-second
  timeouts, and catch every error. This must **never delay or fail sign-in.** Document the Azure
  step in the README: add `User.Read` and grant admin consent.

- Keep `NEXT_PUBLIC_API_SCOPE` empty for the in-repo backend. Leave the Bearer-token code in
  place; it does nothing while the scope is unset.
- In `proxy.ts`, exclude `/api/cron` (and a provider webhook route, if you add one) from the
  session matcher. Those routes check their own secrets.
- `lib/api/http-client.ts` today requires an absolute URL. Make it accept a relative
  `NEXT_PUBLIC_API_BASE_URL=/api/v1` by resolving it against `window.location.origin`.

### 6.5 Submission pipeline and data provider

1. `POST /posts`:
   - Run `analyzePostUrl`.
   - Resolve short links synchronously (5-second timeout). If that times out, accept the post
     and dedupe during the check instead.
   - Derive the platform, content type and external ID on the server; don't trust the client.
   - Dedupe, which can return `409`.
   - Insert the post as `pending` with check `queued`, and return `201`.
   - Then, in `after()`, fetch the post from the provider, run the tag, owner and window checks,
     reclassify if needed, and store the metrics and a snapshot.
2. Provider interface (`lib/server/providers/types.ts`):

   ```ts
   interface PostRef {
     platform: Platform;
     contentType: ContentType;
     url: string;
     externalId: string | null;
   }
   interface FetchedPost {
     canonicalUrl: string | null;
     externalId: string | null;
     mediaKind: "video" | "image" | "carousel" | "text" | null;
     caption: string | null;
     hashtags: string[];
     mentions: string[];
     authorHandle: string | null;
     authorName: string | null;
     publishedAt: Date | null;
     views: number | null;
     reactions: number | null;
     thumbnailUrl: string | null;
     raw: unknown;
   }
   type FetchOutcome =
     | { ok: true; post: FetchedPost }
     | {
         ok: false;
         error:
           | "not_found"
           | "private"
           | "rate_limited"
           | "unsupported"
           | "provider_error";
         retryable: boolean;
         detail?: string;
       };
   interface PostDataProvider {
     readonly id: string;
     fetchMany(
       refs: PostRef[],
       opts: { signal: AbortSignal },
     ): Promise<Map<string, FetchOutcome>>; // keyed by ref.url
   }
   ```

3. Implementations, selected by `POST_DATA_PROVIDER`, with an optional per-platform override such
   as `POST_DATA_PROVIDER_LINKEDIN=manual`:
   - `fixture`: deterministic fake data derived from a hash of the URL. It's the default in
     development, tests and previews, so the whole pipeline runs without keys.
   - `manual`: always returns `unsupported`, so every number comes from an admin.
   - A **third-party provider** (Apify is the reference choice: it has maintained scrapers for all
     four platforms). Before you write it, **check the provider's current docs** for scraper
     names, inputs, output fields, pricing and rate limits. Keep the field mapping per platform in
     one file, and unit-test it with recorded sample payloads in `__fixtures__/`. Tests never use
     the network. Hidden like counts (`null` or `-1`) mean `metrics_unavailable`.
4. If the provider's batch runs can take longer than the function time limit, use its asynchronous
   run with a webhook that checks a secret and ingests the results, instead of waiting inline.

### 6.6 Twice-daily refresh (Vercel Cron)

- `vercel.json`: `{ "crons": [{ "path": "/api/cron/refresh-metrics", "schedule": "0 4,16 * * *" }] }`.
  Cron times are UTC, so that's 08:00 and 20:00 in Tbilisi. Vercel sends
  `Authorization: Bearer $CRON_SECRET` when that variable is set. Cron runs on production only.
- The job takes a Postgres advisory lock (`pg_try_advisory_lock`), so runs never overlap.
- It selects the active posts (§4.7), skips any fetched less than 6 hours ago unless the run is
  forced, and goes oldest-fetched first, in provider batches with limited concurrency.
- It also retries checks still `queued` or in `error`, with backoff.
- Set `export const maxDuration` within the Vercel plan's limit and stop cleanly before it. The
  next run continues where this one stopped, because the order is oldest-fetched first.
- It writes a `sync_runs` row and applies the flags in §4.7.

---

## 7. Frontend changes (extend, don't redesign)

### 7.1 Types, adapters and queries

- Apply §5 to `lib/api/types.ts` (Video → Post; `category` replaces `metric`).
- Extend `ApiAdapter` with `getMyPosts`, `getEmployeePosts`, `submitPost`, `withdrawPost`,
  `recheckPost` and the admin methods. Implement them in **both** `http-adapter.ts` and
  `mock/adapter.ts`.
- The mock gets realistic data across all six content types and four statuses, with checks,
  flags and snapshots. `NEXT_PUBLIC_MOCK_ROLE=admin|employee` (default `admin` in development)
  controls the mock `/me` role.
- `queries.ts`: new keys and hooks. Moderation mutations invalidate the leaderboard, My Posts,
  employee posts and the admin lists.

### 7.2 URL state

- Add `category` (default `video`) and remove `metric`; old links with `?metric=` still open,
  because the parameter is ignored.
- Add the views `my-posts` (with `my-videos` as an alias) and `admin`.

### 7.3 Filter bar (`leaderboard-toolbar.tsx`)

- Replace the metric `SegmentedControl` with a **category** `SegmentedControl`: "Video content"
  and "Static content", with lucide icons.
- The period menu labels are This week / This month / 3-Month Challenge.
- Platform chips show only `CATEGORY_PLATFORMS[category]`. Switching category resets a platform
  that no longer applies to `all`.
- Keep the search field and the mobile swipe row.

### 7.4 Board entries (`leaderboard-list.tsx`, `podium.tsx`, `employee-sheet.tsx`, `my-standing-bar.tsx`)

- **List columns:** rank, employee (avatar, first and last name, department, small platform
  logos), posts, views (video board only), reactions, **score** (always the highlighted column),
  change, and a link to the top post.
- **The podium** keeps its medals and crown and adds a score breakdown (views · reactions on video,
  reactions only on static), platform logos and the top-post link.
- When search hides the podium, list rows for ranks 1–3 also show a medal badge.
- **Don't nest the link inside the row or card `<button>`.** Restructure each item as an `<li>`
  holding the main button plus a sibling link. Keep the accessible labels
  (`use-entry-label.ts`) and the keyboard order correct.
- **The side sheet** shows the category's stats (no views on static) and the counted posts with
  platform, content type, metrics, score and link.
- **The standing bar** shows the gap in score points.
- Show the board's date range, for example "Sep 29 – Oct 5", next to Last updated.
  `LastUpdated` must handle `lastSyncedAt: null`.

### 7.5 My Posts (rename `components/my-videos`)

- Status badges for the four statuses.
- A **check chip**: tag found; "#CrocoBySquad not found: add it or tag @Croco Squad, then
  re-check"; or "We couldn't read this post (is it private?)".
- The category label and the score.
- **Re-check** and **Withdraw** buttons on pending posts.
- The translated reason and the admin's note on rejected and disqualified posts.
- Summary cards: video board rank and score, static board rank and score (challenge period), and
  the approved and pending counts.

### 7.6 Submit dialog

- Change the copy from "video" to "post". The description states the rule (include
  #CrocoBySquad or tag @Croco Squad).
- The URL field and preview show the detected category ("Counts as Video content").
- Map `duplicate_post` and `unsupported_content` inline. `challenge_closed` is a form-level
  message.
- The success copy says an admin will review the post.
- Keep the optional title and posted-date fields. The date is only a fallback (§4.3); label it
  accordingly.

### 7.7 Small fixes

- `VideoThumbnail`: fall back to the placeholder when the image fails to load (`onError`). Provider
  CDN URLs expire.
- Remove `email` from the public `Employee` payload. The user menu already takes the email from
  the session.

---

## 8. Admin panel (`?view=admin`)

- Show the nav item only when `me.role === "admin"`. Load the view with `next/dynamic` so other
  employees never download it. The server enforces access; hiding the item is only for UX.
- **Queue:** status tabs with counts (Pending is the default, then Approved, Rejected,
  Disqualified, Flagged). Filters: category, platform, check result, flag, and search over name,
  email and handle. A table on desktop, cards on mobile. Each row shows the employee, platform
  logo and content type, published date (marked when uncertain), check evidence (tag ✓ or ✗ with
  the matched token, owner match, inside the window), views, reactions and score, the last metric
  update, flag chips, and actions.
- **Detail drawer** (`ResponsiveDialog`, the side variant):
  - an open-post link;
  - the fetched caption with the matched tag highlighted;
  - the author handle and the employee's linked handles;
  - the metric history as an inline-SVG sparkline from the snapshots;
  - the audit log;
  - editable fields: views and reactions (with a lock toggle), `publishedAt`, content type;
  - the actions. Reject and disqualify need a reason code and an optional note labeled "visible
    to the employee". Disqualify asks for confirmation. Approving a post whose check didn't pass
    needs "Approve anyway" plus a note.
- **Bulk actions:** approve the selected posts whose check passed, or reject the selected posts
  with one reason.
- **Sync panel:** the last run (time, OK and failed counts), a "Refresh now" button, and a
  per-post refresh.
- **Export:** a CSV of standings for the current or a chosen week or month, as of a chosen time.
- Build it from the existing primitives (`ResponsiveDialog`, `DropdownMenu`, `ChipGroup`,
  `SegmentedControl`, `MotionButton`, `Badge`, `Input`) and follow the motion and accessibility
  conventions. It works in mock mode.

---

## 9. Configuration

Add these to `.env.example` and the README table. Validate them with Zod in
`lib/server/config.ts`. Missing optional values fall back to safe defaults.

| Variable                                              | Scope  | Notes                                                                               |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`                            | public | `/api/v1` for the in-repo backend                                                   |
| `NEXT_PUBLIC_MOCK_ROLE`                               | public | Mocks only: `admin` or `employee`                                                   |
| `DATABASE_URL`                                        | secret | Supabase transaction pooler URI                                                     |
| `CRON_SECRET`                                         | secret | Vercel Cron bearer token                                                            |
| `POST_DATA_PROVIDER`, `POST_DATA_PROVIDER_<PLATFORM>` | server | `fixture`, `manual`, or the provider ID                                             |
| `<PROVIDER>_API_TOKEN`                                | secret | The third-party provider's token                                                    |
| `ADMIN_EMAILS`                                        | server | Comma-separated                                                                     |
| `CHALLENGE_STARTS_AT`, `CHALLENGE_ENDS_AT`            | server | ISO date-times with offset, e.g. `2026-10-06T00:00:00+04:00`                        |
| `CAMPAIGN_TIMEZONE`                                   | server | Default `Asia/Tbilisi`                                                              |
| `CAMPAIGN_HASHTAGS`                                   | server | Default `CrocoBySquad`                                                              |
| `CAMPAIGN_MENTIONS`                                   | server | e.g. `instagram:<handle>,tiktok:<handle>,facebook:Croco Squad,linkedin:Croco Squad` |
| `SUBMISSION_GRACE_DAYS`, `METRICS_GRACE_DAYS`         | server | Default 3 each                                                                      |
| `GROWTH_FLAG_FACTOR`, `GROWTH_FLAG_MIN`               | server | Default 5 and 1000                                                                  |

`SUPABASE_*` stay reserved. Use them only if you need Supabase Storage, which this design doesn't.

---

## 10. Testing and QA

- **Unit tests** (Vitest, Node):
  - `analyzePostUrl` for every row of §4.1, positive and negative, including the flipped Facebook
    cases;
  - `postScore` (video 1000 views + 50 reactions = 1050; static with 40 reactions = 40, views
    ignored);
  - periods and time-zone boundaries;
  - the tag matcher (case, Unicode, token boundaries, Georgian text, `@handle` and page names);
  - `rankBoard` (ties, search keeps ranks, `myStanding`, `gapToNext`, `previousRank`, `topPost`,
    `platforms`);
  - the moderation transitions;
  - ID-to-date decoding;
  - provider field mapping from recorded payloads;
  - the link resolver's SSRF guard;
  - config parsing.
- **Integration tests** (PGlite + Drizzle, migrations applied in setup):
  - submitting a post, a duplicate through a short link and a canonical link (409), and
    `challenge_closed`;
  - every moderation action, including its audit row and the immediate effect on the
    leaderboard;
  - pending, rejected and disqualified posts never counting, and reinstated posts counting again;
  - the sync job with the fixture provider (snapshots, failure counting, flags, metric lock);
  - the cron route returning 401 without the secret;
  - admin routes returning 403 for employees;
  - the server leaderboard equaling `rankBoard()` on the same data.
- **Manual QA** on port 3100 with a local or development database and the fixture provider. Sign
  in with the mock Entra helpers in `~/.cache/croco-creators-qa/`. Check desktop and mobile
  widths, dark and light themes, `en` and `ka`, and reduced motion. Also run in mock mode as both
  admin and employee.

---

## 11. Open inputs: ask the user when you reach them; don't block earlier phases

1. The exact Croco Squad handles or page names on Instagram, TikTok, Facebook and LinkedIn
   (`CAMPAIGN_MENTIONS`).
2. The challenge start and end dates.
3. The initial admin emails.
4. The data provider account (vendor, token, monthly budget). Until then, use `fixture` and
   `manual`.
5. ~~Whether to rename the app from "Croco Creators" to "Croco by Squad"~~ Decided: renamed.

---

## 12. Delivery plan (each phase ends with all gates green and a commit)

1. **Rename and contract.** The Video → Post rename (behavior-neutral). The new types and
   `API_CONTRACT.md`. The pure modules (`scoring`, `periods`, `campaign-tag`, `ranking`,
   `moderation`) and the extended `platforms`, with tests.
2. **Frontend on mocks.** The mock adapter on the new contract. The filter bar, board entries,
   side sheet, My Posts and submit dialog. The admin panel against the mock. _Exit:_ every screen
   in §7 and §8 works with `NEXT_PUBLIC_USE_MOCKS=true`.
3. **Database and public API.** The Drizzle schema, migrations and RLS. `requireEmployee` with the
   oid key. Profile and photo sync. `/me`, `/leaderboard`, `/me/posts`, `/employees/*`,
   `POST /posts` with the fixture provider. The relative base URL in the HTTP client.
   _Exit:_ the app works end to end against a local database with mocks off.
4. **Provider, checks and cron.** The link resolver, the tag, owner and window checks,
   reclassification, the third-party adapter (or `manual` if there's no account yet), the
   snapshots, flags and cron job, and `vercel.json`.
5. **Admin API.** Moderation, the PATCH overrides, bulk actions, refresh, sync and CSV export,
   all audited, with the admin panel wired to the real API.
6. **Hardening and docs.** Rate limits and the origin check. The README (architecture, env table,
   database setup and migrations, Azure `User.Read` consent, Vercel Cron and env vars, admin
   bootstrap), `.env.example`, a deploy checklist, and a final QA pass.

---

## 13. Acceptance criteria

- [ ] Two boards; the score formulas are exactly as in §4.2; static boards never show or count
      views.
- [ ] Week and month are calendar periods in Tbilisi time, decided by `publishedAt`; "all" is the
      challenge window; posts outside the window never count.
- [ ] A submission validates on the client and the server, rejects duplicates across link
      variants, and lands in `pending` with an automated check that the admin can see.
- [ ] Only approved posts count; disqualifying removes a post from every board immediately; every
      admin action is audited.
- [ ] Metrics refresh at 08:00 and 20:00 Tbilisi time; failures keep the last values and raise
      flags; admins can override and lock the numbers.
- [ ] Each entry shows first and last name, photo (or initials), platform logos, a working link to
      the top post, the views and reactions breakdown, score, rank and change; #1–#3 have badges.
- [ ] The filter bar (category and period) is in the URL and survives a refresh and sharing.
- [ ] Admin endpoints return 403 for employees; the cron route returns 401 without its secret; no
      secret reaches the browser bundle.
- [ ] Mock mode works fully, including the admin panel; every quality gate passes; the README,
      `API_CONTRACT.md` and `.env.example` are up to date.

## 14. Out of scope

- Changing the sign-in provider or flow, beyond §6.4.
- A Better Auth database (instant session revocation).
- Email or Teams notifications.
- Banning an employee entirely, as opposed to disqualifying posts.
- Browsing past periods in the main UI (admins get CSV export instead).
- Embedding posts in iframes.
- Visual redesign.

## 15. Known risks (keep the design able to absorb them)

- Third-party scraping can break or conflict with platform terms. The provider is swappable per
  platform, and `manual` always works.
- Some platforms hide likes or views. The `metrics_unavailable` flag plus admin entry covers it.
- LinkedIn data is the hardest to get. A per-platform `manual` override covers it.
- Vercel function time limits. The job resumes in batches, or uses an asynchronous run plus a
  webhook.
