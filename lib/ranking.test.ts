import { describe, expect, it } from "vitest";
import type { ContentType } from "@/lib/platforms";
import { CONTENT_TYPE_INFO } from "@/lib/platforms";
import {
  type BoardFilter,
  countedPosts,
  postsAsOf,
  postsFrozenAt,
  rankBoard,
  rankMap,
  type RankablePost,
  type PostStatus,
} from "@/lib/ranking";

const range = {
  start: new Date("2026-10-06T00:00:00+04:00"),
  end: new Date("2027-01-06T00:00:00+04:00"),
};
const video: BoardFilter = { category: "video", platform: "all", range };
const staticBoard: BoardFilter = { category: "static", platform: "all", range };

const employees = new Map(
  [
    ["ana", "Ana Gelashvili"],
    ["beka", "Beka Lomidze"],
    ["nino", "Nino Beridze"],
    ["zura", "Zurab Nozadze"],
  ].map(([id, name]) => [id!, { id: id!, name: name! }]),
);

let seq = 0;
function post(
  employeeId: string,
  contentType: ContentType,
  views: number | null,
  reactions: number,
  extra: Partial<RankablePost> & { status?: PostStatus } = {},
): RankablePost {
  seq += 1;
  return {
    id: `p${seq}`,
    employeeId,
    url: `https://example.test/${seq}`,
    platform: CONTENT_TYPE_INFO[contentType].platform,
    contentType,
    category: CONTENT_TYPE_INFO[contentType].category,
    status: "approved",
    publishedAt: new Date("2026-10-10T12:00:00+04:00"),
    views,
    reactions,
    ...extra,
  };
}

describe("rankBoard", () => {
  it("ranks one entry per employee by the sum of their post scores", () => {
    const posts = [
      post("ana", "tiktok_video", 1000, 50), // 1050
      post("ana", "instagram_reel", 200, 20), // 220
      post("nino", "facebook_video", 1100, 100), // 1200
    ];
    const board = rankBoard(posts, employees, video);
    expect(
      board.entries.map((e) => [e.employee.id, e.rank, e.score, e.postCount]),
    ).toEqual([
      ["ana", 1, 1270, 2],
      ["nino", 2, 1200, 1],
    ]);
    expect(board.entries[0]).toMatchObject({
      totalViews: 1200,
      totalReactions: 70,
    });
  });

  it("counts only approved posts in the category, platform and period", () => {
    const posts = [
      post("ana", "tiktok_video", 100, 1),
      post("beka", "tiktok_video", 999, 1, { status: "pending" }),
      post("beka", "tiktok_video", 999, 1, { status: "rejected" }),
      post("beka", "tiktok_video", 999, 1, { status: "disqualified" }),
      post("nino", "linkedin_post", null, 999), // static: not on the video board
      post("zura", "tiktok_video", 999, 1, {
        publishedAt: new Date("2026-10-05T23:59:59+04:00"),
      }),
      post("zura", "tiktok_video", 999, 1, { publishedAt: null }),
    ];
    const board = rankBoard(posts, employees, video);
    expect(board.entries.map((e) => e.employee.id)).toEqual(["ana"]);
    expect(
      rankBoard(posts, employees, { ...video, platform: "instagram" }).entries,
    ).toEqual([]);
  });

  it("never counts views on the static board", () => {
    const board = rankBoard(
      [post("nino", "instagram_photo", 50_000, 40)],
      employees,
      staticBoard,
    );
    expect(board.entries[0]).toMatchObject({
      score: 40,
      totalViews: null,
      totalReactions: 40,
    });
    expect(board.entries[0]?.topPost.views).toBeNull();
  });

  it("breaks ties by reactions, then by name", () => {
    const posts = [
      post("zura", "tiktok_video", 90, 10), // 100, 10 reactions
      post("beka", "tiktok_video", 50, 50), // 100, 50 reactions
      post("ana", "tiktok_video", 90, 10), // 100, 10 reactions, "Ana" < "Zurab"
    ];
    expect(
      rankBoard(posts, employees, video).entries.map((e) => e.employee.id),
    ).toEqual(["beka", "ana", "zura"]);
  });

  it("keeps ranks, participants and my standing when searching", () => {
    const posts = [
      post("ana", "tiktok_video", 300, 0),
      post("nino", "tiktok_video", 200, 0),
      post("zura", "tiktok_video", 100, 0),
    ];
    const board = rankBoard(posts, employees, video, {
      search: "zur",
      meId: "nino",
    });
    expect(board.entries.map((e) => [e.employee.id, e.rank])).toEqual([
      ["zura", 3],
    ]);
    expect(board.totalParticipants).toBe(3);
    expect(board.myStanding).toMatchObject({
      entry: { rank: 2 },
      gapToNext: 100,
    });
  });

  it("gives #1 no gap and the unranked no standing", () => {
    const posts = [post("ana", "tiktok_video", 300, 0)];
    expect(
      rankBoard(posts, employees, video, { meId: "ana" }).myStanding?.gapToNext,
    ).toBeNull();
    expect(
      rankBoard(posts, employees, video, { meId: "beka" }).myStanding,
    ).toBeNull();
  });

  it("matches names regardless of case and accents", () => {
    const posts = [post("nino", "tiktok_video", 1, 0)];
    expect(
      rankBoard(posts, employees, video, { search: "NINO bér" }).entries,
    ).toHaveLength(1);
  });

  it("sets previousRank from yesterday's board (null if they weren't ranked)", () => {
    const yesterday = rankBoard(
      [
        post("nino", "tiktok_video", 500, 0),
        post("ana", "tiktok_video", 100, 0),
      ],
      employees,
      video,
    );
    const today = rankBoard(
      [
        post("ana", "tiktok_video", 900, 0),
        post("nino", "tiktok_video", 500, 0),
        post("zura", "tiktok_video", 50, 0),
      ],
      employees,
      video,
      { previousRanks: rankMap(yesterday) },
    );
    expect(
      today.entries.map((e) => [e.employee.id, e.rank, e.previousRank]),
    ).toEqual([
      ["ana", 1, 2],
      ["nino", 2, 1],
      ["zura", 3, null],
    ]);
  });

  it("picks the top post by score, ties going to the most recent", () => {
    const older = post("ana", "tiktok_video", 100, 0, {
      publishedAt: new Date("2026-10-10T00:00:00Z"),
    });
    const newer = post("ana", "instagram_reel", 100, 0, {
      publishedAt: new Date("2026-10-20T00:00:00Z"),
    });
    const best = post("ana", "facebook_video", 50, 0);
    const entry = rankBoard([older, newer, best], employees, video).entries[0]!;
    expect(entry.topPost).toMatchObject({
      id: newer.id,
      score: 100,
      platform: "instagram",
    });
  });

  it("lists the platforms used, in the standard order", () => {
    const posts = [
      post("ana", "tiktok_video", 1, 0),
      post("ana", "facebook_video", 1, 0),
      post("ana", "tiktok_video", 1, 0),
    ];
    expect(rankBoard(posts, employees, video).entries[0]?.platforms).toEqual([
      "facebook",
      "tiktok",
    ]);
  });

  it("ignores posts from unknown employees", () => {
    expect(
      rankBoard([post("ghost", "tiktok_video", 1, 0)], employees, video)
        .totalParticipants,
    ).toBe(0);
  });
});

describe("countedPosts", () => {
  it("returns one employee's counted posts, highest score first", () => {
    const a = post("ana", "tiktok_video", 10, 0);
    const b = post("ana", "instagram_reel", 99, 0);
    const pending = post("ana", "tiktok_video", 999, 0, { status: "pending" });
    const other = post("nino", "tiktok_video", 50, 0);
    expect(
      countedPosts([a, b, pending, other], "ana", video).map((p) => p.id),
    ).toEqual([b.id, a.id]);
  });
});

describe("postsAsOf", () => {
  const asOf = new Date("2026-10-20T12:00:00Z");
  const at = (iso: string) => new Date(iso);
  const history = (
    approvedAt: Date | null,
    snapshots: [string, number | null, number][],
  ) => ({
    approvedAt,
    snapshots: snapshots.map(([iso, views, reactions]) => ({
      fetchedAt: at(iso),
      views,
      reactions,
    })),
  });

  it("uses each post's latest snapshot at or before the time", () => {
    const [asItWas] = postsAsOf(
      [
        {
          ...post("ana", "tiktok_video", 9000, 900),
          ...history(at("2026-10-12T00:00:00Z"), [
            ["2026-10-19T04:00:00Z", 500, 50],
            ["2026-10-20T04:00:00Z", 800, 80],
            ["2026-10-20T16:00:00Z", 1200, 120],
          ]),
        },
      ],
      asOf,
    );
    expect(asItWas).toMatchObject({ views: 800, reactions: 80 });
  });

  it("leaves out posts approved later, or not approved now", () => {
    const later = {
      ...post("ana", "tiktok_video", 100, 10),
      ...history(at("2026-10-20T13:00:00Z"), []),
    };
    const disqualified = {
      ...post("nino", "tiktok_video", 100, 10, { status: "disqualified" }),
      ...history(at("2026-10-01T00:00:00Z"), [["2026-10-02T00:00:00Z", 5, 1]]),
    };
    const pending = {
      ...post("zura", "tiktok_video", 100, 10, { status: "pending" }),
      ...history(null, []),
    };
    expect(postsAsOf([later, disqualified, pending], asOf)).toEqual([]);
  });

  it("counts a post approved before any snapshot as zero", () => {
    const [asItWas] = postsAsOf(
      [
        {
          ...post("ana", "linkedin_post", null, 70),
          ...history(at("2026-10-15T00:00:00Z"), []),
        },
      ],
      asOf,
    );
    expect(asItWas).toMatchObject({ views: null, reactions: 0 });
  });
});

describe("postsFrozenAt", () => {
  const end = new Date("2026-10-20T00:00:00Z");
  const at = (iso: string) => new Date(iso);
  const snaps = (
    rows: [string, number | null, number, ("provider" | "manual")?][],
  ) =>
    rows.map(([iso, views, reactions, source]) => ({
      fetchedAt: at(iso),
      views,
      reactions,
      source: source ?? ("provider" as const),
    }));

  it("keeps the numbers that held at the end, whenever the post was approved", () => {
    const [frozen] = postsFrozenAt(
      [
        {
          ...post("ana", "tiktok_video", 9000, 900),
          // Approved after the round ended; checked while it ran.
          approvedAt: at("2026-10-21T09:00:00Z"),
          snapshots: snaps([
            ["2026-10-18T10:00:00Z", 500, 50],
            ["2026-10-19T22:00:00Z", 800, 80],
            ["2026-10-25T10:00:00Z", 9000, 900],
          ]),
        },
      ],
      end,
    );
    expect(frozen).toMatchObject({ views: 800, reactions: 80 });
  });

  it("uses a post's first snapshot after the end if it had none before", () => {
    const [frozen] = postsFrozenAt(
      [
        {
          ...post("beka", "tiktok_video", 9000, 900),
          approvedAt: at("2026-10-22T09:00:00Z"),
          snapshots: snaps([
            ["2026-10-23T10:00:00Z", 2000, 20],
            ["2026-10-22T10:00:00Z", 1500, 15],
          ]),
        },
      ],
      end,
    );
    expect(frozen).toMatchObject({ views: 1500, reactions: 15 });
  });

  it("keeps an admin's locked numbers, and a never-fetched post's own", () => {
    const [locked, never] = postsFrozenAt(
      [
        {
          ...post("nino", "tiktok_video", 300, 3),
          approvedAt: at("2026-10-10T00:00:00Z"),
          metricsLocked: true,
          snapshots: snaps([
            ["2026-10-15T00:00:00Z", 300, 3, "manual"],
            ["2026-10-19T00:00:00Z", 5000, 50],
          ]),
        },
        {
          ...post("zura", "linkedin_post", null, 70),
          approvedAt: at("2026-10-10T00:00:00Z"),
          snapshots: [],
        },
      ],
      end,
    );
    expect(locked).toMatchObject({ views: 300, reactions: 3 });
    expect(never).toMatchObject({ views: null, reactions: 70 });
  });
});
