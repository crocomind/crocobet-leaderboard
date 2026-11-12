# Croco Creators external API (v1)

Read-only leaderboard results and employees' posts for other Crocobet projects. It's for **server-to-server calls
only**: the key is a secret, so keep it on your backend and never send it to a browser.

- **Base URL:** `https://leaderboard.crocomind.com/api/external/v1`
- **Authentication:** `Authorization: Bearer <key>`. Ask a Croco Creators admin for the key. It's
  one key shared by every project, so rotating it means updating every caller.
- **Format:** JSON.
- **Stability:** v1 only gets additive changes (new fields). Ignore fields you don't know.

## `GET /leaderboards`

Every leaderboard that has started, past and running: the 3-Month Challenge, then the weekly
rounds, then the monthly rounds (each by start date). Upcoming rounds aren't listed. Under each
leaderboard, everyone ranked on it, on two boards that are scored separately. No query
parameters.

```bash
curl -s -H "Authorization: Bearer $CROCO_CREATORS_API_KEY" \
  https://leaderboard.crocomind.com/api/external/v1/leaderboards | jq
```

### Response

```json
{
  "leaderboards": [
    {
      "type": "challenge",
      "name": "3-Month Challenge",
      "startDate": "2026-10-06",
      "endDate": "2027-01-05",
      "status": "running",
      "video": [
        {
          "rank": 1,
          "name": "Ana Beridze",
          "email": "ana.beridze@crocobet.com",
          "department": "Marketing",
          "score": 6350,
          "views": 6000,
          "reactions": 350,
          "posts": 2
        }
      ],
      "static": [
        {
          "rank": 1,
          "name": "Nino Lomidze",
          "email": "nino.lomidze@crocobet.com",
          "department": "HR",
          "score": 70,
          "views": null,
          "reactions": 70,
          "posts": 1
        }
      ]
    },
    {
      "type": "week",
      "name": "Week 1",
      "startDate": "2026-10-06",
      "endDate": "2026-10-12",
      "status": "finished",
      "video": [],
      "static": []
    }
  ]
}
```

### Leaderboard fields

| Field                  | Meaning                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `type`                 | `challenge` (the 3-Month Challenge), `week` or `month`.                                          |
| `name`                 | The name admins gave the round, else `Week 3` (numbered by start date) or the month (`October`). |
| `startDate`, `endDate` | Calendar dates, **both inclusive**, in Tbilisi time (`Asia/Tbilisi`).                            |
| `status`               | `running` or `finished`.                                                                         |
| `video`                | The video board, by rank. Score = views + reactions.                                             |
| `static`               | The static board, by rank. Score = reactions.                                                    |

### Participant fields

| Field        | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `rank`       | 1, 2, 3… Unique: ties go to more reactions, then the name.                               |
| `name`       | "First Last" in English when known, else their display name.                             |
| `email`      | Lowercase work email. The stable way to identify a person across leaderboards and calls. |
| `department` | Empty string when unknown.                                                               |
| `score`      | Their total on that board.                                                               |
| `views`      | Total views; always `null` on the `static` board.                                        |
| `reactions`  | Total likes and reactions (comments, shares and saves never count).                      |
| `posts`      | How many of their approved posts count on that board.                                    |

### What counts

| Board    | Counts                                                          | Score             |
| -------- | --------------------------------------------------------------- | ----------------- |
| `video`  | TikTok videos and photo posts, Instagram Reels, Facebook videos | views + reactions |
| `static` | LinkedIn posts, Facebook posts, Instagram photo posts           | reactions         |

- Only posts an admin approved count, and only on the leaderboards whose dates contain the day
  they were **published**.
- Only people with at least one counted post are listed.
- **A finished round's results are frozen** at its end: ranks and numbers no longer change. A
  running leaderboard changes when metrics refresh (twice a day, at 12:00 and 23:59 Tbilisi time)
  and whenever an admin approves a post.
- The 3-Month Challenge's metrics keep refreshing for 3 days after it ends, so treat its results
  as final only after that.
- Admins can take someone off one leaderboard; they're then left out of that leaderboard only.

## `GET /content/{username}`

One employee's approved posts (video and static), newest published first, found by the username
of their work email: `jdoe` for `jdoe@crocobet.com`. Upper or lower case doesn't matter. The
username is the part of the `email` before `@` in `/leaderboards`.

```bash
curl -s -H "Authorization: Bearer $CROCO_CREATORS_API_KEY" \
  https://leaderboard.crocomind.com/api/external/v1/content/jdoe | jq
```

### Response

```json
{
  "employee": {
    "name": "John Doe",
    "email": "jdoe@crocobet.com",
    "department": "Marketing"
  },
  "posts": [
    {
      "url": "https://www.tiktok.com/@jdoe/video/7432000000000000000",
      "platform": "tiktok",
      "category": "video",
      "title": "Behind the scenes at Croco",
      "publishedAt": "2026-11-03T06:00:00.000Z",
      "views": 5000,
      "reactions": 300,
      "score": 5300,
      "thumbnailUrl": "https://p16-sign.tiktokcdn.com/..."
    }
  ]
}
```

| Field                 | Meaning                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `employee.name`       | "First Last" in English when known, else their display name.                                                                     |
| `employee.department` | Empty string when unknown.                                                                                                       |
| `posts`               | Every approved post, newest published first. Empty if they have none. Pending, rejected and disqualified posts are never listed. |
| `url`                 | The post's link.                                                                                                                 |
| `platform`            | `instagram`, `facebook`, `tiktok` or `linkedin`.                                                                                 |
| `category`            | `video` (score = views + reactions) or `static` (score = reactions). See [What counts](#what-counts).                            |
| `title`               | The title the employee gave it, else the caption's first line; `null` if neither.                                                |
| `publishedAt`         | When it was published on the platform (UTC).                                                                                     |
| `views`               | Latest views; always `null` on static posts, and `null` while a video's views are hidden.                                        |
| `reactions`, `score`  | Latest likes and reactions, and the post's score from them.                                                                      |
| `thumbnailUrl`        | A preview image from the platform's CDN, or `null`. These links can expire; don't store them, fetch them again.                  |

The numbers are the post's **latest** metrics. A finished round in `/leaderboards` counts the
numbers frozen at that round's end, so they can be lower than here.

## Errors

Errors have this body; `message` is for logs.

```json
{ "error": { "code": "unauthorized", "message": "Missing or wrong API key" } }
```

| HTTP | `code`                | When                                                                                      |
| ---- | --------------------- | ----------------------------------------------------------------------------------------- |
| 401  | `unauthorized`        | Missing or wrong key (or the API is switched off on the server).                          |
| 404  | `not_found`           | `/content/{username}`: no employee has that email username.                               |
| 503  | `service_unavailable` | The database didn't answer in 20 seconds, or something else went wrong. Retry once later. |

## Freshness and caching

Responses aren't cached (`Cache-Control: no-store`): each call reads the database. Polling every
few minutes is plenty. Cache on your side if you show the results to many users.
