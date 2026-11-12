# Croco Creators external API (v1)

Read-only leaderboard results for other Crocobet projects. It's for **server-to-server calls
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

### Errors

Errors have this body; `message` is for logs.

```json
{ "error": { "code": "unauthorized", "message": "Missing or wrong API key" } }
```

| HTTP | `code`                | When                                                                                      |
| ---- | --------------------- | ----------------------------------------------------------------------------------------- |
| 401  | `unauthorized`        | Missing or wrong key (or the API is switched off on the server).                          |
| 503  | `service_unavailable` | The database didn't answer in 20 seconds, or something else went wrong. Retry once later. |

### Freshness and caching

Responses aren't cached (`Cache-Control: no-store`): each call reads the database. Polling every
few minutes is plenty. Cache on your side if you show the results to many users.
