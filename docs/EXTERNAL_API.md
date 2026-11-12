# Croco Creators external API (v1)

Read-only leaderboard standings for other Crocobet projects. It's for **server-to-server calls
only**: the key is a secret, so keep it on your backend and never send it to a browser.

- **Base URL:** `https://leaderboard.crocomind.com/api/external/v1`
- **Authentication:** `Authorization: Bearer <key>`. Ask a Croco Creators admin for the key. It's
  one key shared by every project, so rotating it means updating every caller.
- **Format:** JSON. Timestamps are ISO 8601 in UTC (`"2026-10-20T06:00:00.000Z"`).
- **Stability:** v1 only gets additive changes (new fields, new optional parameters). Ignore
  fields you don't know.

## `GET /standings`

One leaderboard's standings: everyone ranked on it, by rank. The ranks and numbers are the same
as the app's leaderboard.

```bash
curl -H "Authorization: Bearer $CROCO_CREATORS_API_KEY" \
  "https://leaderboard.crocomind.com/api/external/v1/standings?category=video&period=all"
```

### Query parameters

All are optional.

| Parameter  | Values                                               | Default | Meaning                                                                                               |
| ---------- | ---------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `category` | `video`, `static`                                    | `video` | Which board (see below).                                                                              |
| `period`   | `all`, `week`, `month`                               | `all`   | `all` is the 3-Month Challenge. `week` and `month` are the weekly or monthly round **running now**.   |
| `round`    | a round id (UUID)                                    | none    | A specific weekly or monthly round of that `period` that has started (running or finished).           |
| `platform` | `all`, `instagram`, `facebook`, `tiktok`, `linkedin` | `all`   | Count only that platform's posts. A platform that isn't on the board (LinkedIn on video) means `all`. |

### The boards

| `category` | Counts                                                          | Score             |
| ---------- | --------------------------------------------------------------- | ----------------- |
| `video`    | TikTok videos and photo posts, Instagram Reels, Facebook videos | views + reactions |
| `static`   | LinkedIn posts, Facebook posts, Instagram photo posts           | reactions         |

- Only posts an admin approved count, and only in the period they were **published** in.
- Reactions are likes and reactions only (no comments, shares or saves). Static posts have no views.
- Ranks are unique: ties go to more reactions, then the name.

### Which leaderboard you get

The response's `board` says what you got. Check it rather than assuming:

- `period=week` / `month` without `round`: the round running now. If none is running (none set
  up, before the first, between rounds, or after the last), you get the **3-Month Challenge**
  instead, and `board.period` is `all`.
- `round=<id>`: that round, if it has started. An unknown or upcoming id falls back to the
  running round (or the challenge), so compare `board.id` with the id you asked for.
- **A finished round's results are frozen** at its end (`board.status` is `finished`): ranks and
  numbers no longer change. The 3-Month Challenge's metrics keep refreshing for 3 days after it
  ends, so treat its standings as final only after that.
- Admins can take someone off one leaderboard. They're then left out of that leaderboard only.

### Response

```json
{
  "board": {
    "id": "challenge",
    "category": "video",
    "platform": "all",
    "period": "all",
    "round": null,
    "startsAt": "2026-10-05T20:00:00.000Z",
    "endsAt": "2027-01-05T20:00:00.000Z",
    "status": "running",
    "timeZone": "Asia/Tbilisi"
  },
  "totalParticipants": 2,
  "lastSyncedAt": "2026-10-20T08:00:41.000Z",
  "standings": [
    {
      "rank": 1,
      "previousRank": 2,
      "employee": {
        "id": "3f6c1a52-8d0e-4f7b-9a41-2b7c5e9d1f00",
        "email": "ana.beridze@crocobet.com",
        "name": "Ana Beridze",
        "firstName": "Ana",
        "lastName": "Beridze",
        "department": "Marketing"
      },
      "postCount": 2,
      "totalViews": 6000,
      "totalReactions": 350,
      "score": 6350,
      "platforms": ["instagram", "tiktok"]
    }
  ]
}
```

| Field                             | Meaning                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `board.id`                        | `challenge`, or the round's id.                                                                                             |
| `board.period`                    | The leaderboard shown: `all` (the challenge), `week` or `month`.                                                            |
| `board.round`                     | `{ id, kind, name, number }` for a round, else `null`. `name` is `null` when admins didn't name it: label it e.g. "Week 3". |
| `board.startsAt`, `board.endsAt`  | The dates it counts; `endsAt` is exclusive. Rounds are whole days in `board.timeZone`.                                      |
| `board.status`                    | `upcoming`, `running` or `finished`.                                                                                        |
| `lastSyncedAt`                    | When metrics were last refreshed (twice a day, at 12:00 and 23:59 Tbilisi time), or `null` before the first refresh.        |
| `standings[].previousRank`        | Rank on the same board 24 hours ago; `null` if they weren't ranked then (new). On a finished round it equals `rank`.        |
| `standings[].employee.id`         | Stable for a person, even if their name or email changes. Prefer it for matching across calls.                              |
| `standings[].employee.email`      | Lowercase work email.                                                                                                       |
| `standings[].employee.name`       | "First Last" in English when known, else their display name.                                                                |
| `standings[].employee.department` | Empty string when unknown.                                                                                                  |
| `standings[].totalViews`          | `null` on the `static` board.                                                                                               |

TypeScript types: [`lib/api/external.ts`](../lib/api/external.ts) in this repo.

### Errors

Errors have this body; `message` is for logs.

```json
{ "error": { "code": "unauthorized", "message": "Missing or wrong API key" } }
```

| HTTP | `code`                | When                                                                                                    |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| 400  | `validation_error`    | A query parameter has a value not listed above.                                                         |
| 401  | `unauthorized`        | Missing or wrong key (or the API is switched off on the server).                                        |
| 503  | `service_unavailable` | The database didn't answer in 20 seconds, or something else went wrong. Retry once after a few seconds. |

### Freshness and caching

Responses aren't cached (`Cache-Control: no-store`): each call reads the database. Metrics
change twice a day, but admins approve posts at any time. Polling every few minutes is plenty.
Cache on your side if you show the standings to many users.
