# Croco Creators API contract

The contract between the frontend and the backend. The frontend's TypeScript types live in
[`lib/api/types.ts`](lib/api/types.ts), and the mock backend in
[`lib/api/mock/`](lib/api/mock/) follows this document. The mock is a good reference
implementation.

## Basics

- **Base URL:** the value of `NEXT_PUBLIC_API_BASE_URL`, for example `https://api.example.com`.
  All paths below are relative to it.
- **Format:** JSON in and out. Requests send `Accept: application/json`, and requests with a
  body also send `Content-Type: application/json`.
- **Authentication:** every request will carry `Authorization: Bearer <Entra ID access token>`
  once sign-in is added. The API should identify the signed-in employee from that token. The
  frontend never sends an employee id for "me".
- **CORS:** if the API runs on a different origin, allow the frontend origin, the `GET` and
  `POST` methods, and the `Authorization` and `Content-Type` headers.
- **Timestamps:** `IsoDateTime` is ISO 8601 in UTC (`"2026-10-01T09:30:00.000Z"`).
  `IsoDate` is a calendar date (`"2026-09-28"`).

## Errors

Non-2xx responses use this body:

```json
{
  "error": {
    "code": "duplicate_video",
    "message": "This video has already been submitted"
  }
}
```

| HTTP | `code`                                                      | When                            |
| ---- | ----------------------------------------------------------- | ------------------------------- |
| 400  | `validation_error`                                          | Malformed request               |
| 401  | `unauthorized`                                              | Missing or expired token        |
| 403  | `forbidden`                                                 | Signed in but not allowed       |
| 404  | `not_found`                                                 | Unknown employee, etc.          |
| 409  | `duplicate_video`                                           | The video was already submitted |
| 422  | `invalid_url`, `unsupported_platform` or `validation_error` | The submitted link isn't valid  |
| 429  | `rate_limited`                                              | Too many requests               |
| 5xx  | `service_unavailable`                                       | Anything else                   |

The frontend shows `duplicate_video`, `invalid_url` and `unsupported_platform` inline on the
link field. Every other error shows a generic message with a retry button. `message` is for
logs and is never shown to users, because the UI has its own translations.

## Types

```ts
type Platform = "instagram" | "facebook" | "tiktok" | "linkedin";
type VideoStatus = "pending" | "verified" | "rejected";
type LeaderboardMetric = "views" | "reactions" | "score";
type LeaderboardPeriod = "week" | "month" | "all";
type PlatformFilter = Platform | "all";

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  avatarUrl: string | null; // optional photo; initials are shown when null
}

interface Video {
  id: string;
  employeeId: string;
  url: string; // normalized link (see "Link normalization")
  platform: Platform;
  title: string | null;
  postedAt: IsoDate | null;
  submittedAt: IsoDateTime;
  status: VideoStatus;
  rejectionReason: string | null; // set only when status is "rejected"; shown to the employee
  views: number; // 0 until verified and synced
  reactions: number; // likes + comments + shares, as the backend defines it
  thumbnailUrl: string | null; // optional; a placeholder is shown when null
}

interface LeaderboardEntry {
  rank: number; // 1-based position in the full ranking for this query
  previousRank: number | null; // rank in the previous period; null = new on the board
  employee: Employee;
  videoCount: number;
  totalViews: number;
  totalReactions: number;
  score: number; // combined score
}
```

## Endpoints

### `GET /me`

The signed-in employee.

```json
{
  "id": "emp-tamar-lomidze",
  "name": "Tamar Lomidze",
  "email": "tamar.lomidze@crocobet.com",
  "department": "Customer Support",
  "avatarUrl": null
}
```

### `GET /leaderboard?metric=&platform=&period=&search=`

| Param      | Values                                                       | Default |
| ---------- | ------------------------------------------------------------ | ------- |
| `metric`   | `views` \| `reactions` \| `score`                            | `views` |
| `platform` | `all` \| `instagram` \| `facebook` \| `tiktok` \| `linkedin` | `all`   |
| `period`   | `week` \| `month` \| `all`                                   | `month` |
| `search`   | Free text, matched against employee names (optional)         | —       |

```json
{
  "query": {
    "metric": "views",
    "platform": "all",
    "period": "month",
    "search": ""
  },
  "entries": [
    {
      "rank": 1,
      "previousRank": 2,
      "employee": {
        "id": "emp-giorgi-kapanadze",
        "name": "Giorgi Kapanadze",
        "email": "giorgi.kapanadze@crocobet.com",
        "department": "IT",
        "avatarUrl": null
      },
      "videoCount": 4,
      "totalViews": 36616,
      "totalReactions": 2900,
      "score": 65616
    }
  ],
  "totalParticipants": 22,
  "myStanding": {
    "entry": {
      "rank": 14,
      "previousRank": 9,
      "employee": { "id": "emp-tamar-lomidze", "...": "..." },
      "videoCount": 3,
      "totalViews": 2940,
      "totalReactions": 323,
      "score": 6170
    },
    "gapToNext": 199
  },
  "lastSyncedAt": "2026-10-01T09:30:00.000Z"
}
```

Rules:

- **Only verified videos count.** Pending and rejected videos never affect rankings.
- **Ranking:** sort by the chosen metric (descending). Break ties by `score`, then by name. Ranks
  are unique and contiguous (1, 2, 3, ...). Employees with no counted videos in the
  platform/period are left out.
- **Period:** `week` is the last 7 days, `month` the last 30 days, and `all` is all time. The mock
  filters by the video's `postedAt` (falling back to `submittedAt`) and uses each video's
  lifetime stats. If the backend wants "views gained during the period" instead, the response
  shape stays the same.
- **`previousRank`:** the employee's rank for the same metric and platform in the previous
  window (the 7 or 30 days before; for `all`, the ranking as of 7 days ago). Use `null` if they
  weren't ranked then. The UI shows ▲/▼ from `previousRank - rank`.
- **`search`:** filters `entries` _after_ ranking. Ranks are **not** renumbered, and
  `totalParticipants` and `myStanding` ignore the search.
- **`entries`:** the full ranked list, sorted by rank. The UI expects about 25 to 300 employees,
  so there's no pagination. If this grows a lot, add `limit`/`cursor` and keep `myStanding`.
- **`myStanding`:** the signed-in employee's entry, plus `gapToNext`, which is how much of the
  selected metric they need to reach the next rank up (`null` when they're #1). It's `null` when
  they aren't ranked for this query.
- **`score`:** the backend owns the formula. The mock uses `views + 10 × reactions`.
- **`lastSyncedAt`:** when platform stats were last refreshed. It's shown as "Last updated X
  minutes ago".

### `GET /me/videos`

All of the signed-in employee's submissions, newest first, in every status.

```json
{
  "videos": [
    {
      "id": "vid-123",
      "employeeId": "emp-tamar-lomidze",
      "url": "https://tiktok.com/@tamar.lomidze/video/7412345678901234567",
      "platform": "tiktok",
      "title": "Support team's morning standup",
      "postedAt": "2026-09-29",
      "submittedAt": "2026-09-29T10:12:00.000Z",
      "status": "verified",
      "rejectionReason": null,
      "views": 1240,
      "reactions": 118,
      "thumbnailUrl": null
    }
  ],
  "summary": {
    "totalViews": 8420,
    "totalReactions": 861,
    "videoCount": 7,
    "rank": 17,
    "totalParticipants": 25
  }
}
```

`summary` totals count verified videos only. `videoCount` counts every submission. `rank` is
the all-time rank by combined score (`null` if not ranked).

### `GET /employees/{employeeId}/videos?platform=&period=`

One employee's **verified** videos for the given filters, most viewed first. These are the same
videos counted in that employee's leaderboard entry. It's used by the side sheet that opens when
you click an employee. The response is `Video[]`.

### `POST /videos`

Submits a video for verification.

```json
{
  "url": "https://tiktok.com/@tamar.lomidze/video/7412345678901234567",
  "platform": "tiktok",
  "title": "Support team's Friday dance",
  "postedAt": "2026-09-30"
}
```

`title` (at most 120 characters) and `postedAt` (not in the future) are optional. The response
is `201` with the created `Video`, whose `status` is `"pending"` and whose stats are `0`.

The backend must re-validate the request:

- `422 invalid_url` or `unsupported_platform` if the link isn't a supported video/post link, or
  if `platform` doesn't match the link.
- `409 duplicate_video` if the normalized link was already submitted, by anyone.

## Link normalization

The frontend sends an already-normalized `url`. The backend should normalize the same way
before storing it or checking for duplicates, so that variants of one link count once:

1. Force `https://`, lowercase the host, and drop a leading `www.` or `m.`.
2. Decode the path (`urn%3Ali%3Aactivity%3A1` → `urn:li:activity:1`) and drop trailing slashes.
3. Drop all query parameters except the ones that identify the video. Today that's only
   Facebook's `v` in `/watch?v=`.

The accepted link patterns per platform are in [`lib/platforms.ts`](lib/platforms.ts), and the
test cases are in [`lib/platforms.test.ts`](lib/platforms.test.ts).
