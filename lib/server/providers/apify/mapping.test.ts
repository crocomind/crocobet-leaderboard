import { describe, expect, it } from "vitest";
import facebook from "./__fixtures__/facebook.json";
import instagram from "./__fixtures__/instagram.json";
import linkedin from "./__fixtures__/linkedin.json";
import tiktok from "./__fixtures__/tiktok.json";
import { ACTORS, keysOf } from "./mapping";

const map = (platform: keyof typeof ACTORS, item: unknown) =>
  ACTORS[platform].map(item as Record<string, unknown>);

function post(platform: keyof typeof ACTORS, item: unknown) {
  const { outcome } = map(platform, item);
  if (!outcome.ok) throw new Error(`expected a post, got ${outcome.error}`);
  return outcome.post;
}

describe("Apify item mapping", () => {
  it("maps a TikTok video", () => {
    expect(post("tiktok", tiktok[0])).toMatchObject({
      canonicalUrl:
        "https://www.tiktok.com/@gretalynnhihi/video/7543693751290481942",
      externalId: "7543693751290481942",
      mediaKind: "video",
      hashtags: expect.arrayContaining(["CrocoBySquad"]),
      mentions: expect.arrayContaining(["crocosquad"]),
      authorHandle: "gretalynnhihi",
      authorName: "Greta Lynn",
      publishedAt: new Date("2025-08-28T17:44:35.000Z"),
      views: 145900,
      reactions: 23400,
    });
    expect(map("tiktok", tiktok[0]).keys).toContain(
      "tiktok:7543693751290481942",
    );
    expect(map("tiktok", tiktok[1]).outcome).toMatchObject({
      ok: false,
      error: "private",
    });
  });

  it("maps Instagram reels and posts, with hidden likes as unknown", () => {
    expect(post("instagram", instagram[0])).toMatchObject({
      externalId: "DZN3mhZBQ_Q",
      mediaKind: "video",
      // Plays, not the deprecated view count.
      views: 241820,
      reactions: 11481,
      mentions: expect.arrayContaining(["crocosquad", "nasa"]),
      authorHandle: "nasawebb",
    });
    expect(post("instagram", instagram[1])).toMatchObject({
      mediaKind: "carousel",
      views: null,
      reactions: null,
      hashtags: ["CrocoBySquad"],
    });
    const gone = map("instagram", instagram[2]);
    expect(gone.outcome.ok).toBe(false);
    expect(gone.keys).toContain("https://www.instagram.com/p/Gone0000000/");
  });

  it("maps Facebook reels and photo posts", () => {
    expect(post("facebook", facebook[0])).toMatchObject({
      externalId: "895509256298494",
      mediaKind: "video",
      views: 309624,
      // All reaction types together.
      reactions: 147,
      hashtags: ["crocobysquad"],
      authorHandle: "bbcearth",
      authorName: "BBC Earth",
    });
    expect(post("facebook", facebook[1])).toMatchObject({
      mediaKind: "image",
      views: null,
      reactions: 88,
      caption: "Our office makeover, with Croco Squad",
      thumbnailUrl: "https://scontent.xx.fbcdn.net/photo.jpg",
    });
  });

  it("maps LinkedIn posts, with hidden reactions as unknown", () => {
    expect(post("linkedin", linkedin[0])).toMatchObject({
      externalId: "activity:7329207003942125568",
      mediaKind: "text",
      views: null,
      reactions: 2916,
      authorHandle: "williamhgates",
      publishedAt: new Date("2025-05-16T18:11:59.821Z"),
    });
    expect(post("linkedin", linkedin[1])).toMatchObject({
      mediaKind: "image",
      reactions: null,
      publishedAt: new Date(1747419119821),
    });
  });

  it("keys items by link and by post ID", () => {
    const keys = keysOf("https://www.instagram.com/reel/DZN3mhZBQ_Q/?igsh=x");
    expect(keys).toContain("instagram:DZN3mhZBQ_Q");
    expect(keysOf(null, "", 3)).toEqual([]);
  });
});
