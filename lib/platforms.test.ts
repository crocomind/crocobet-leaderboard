import { describe, expect, it } from "vitest";
import {
  analyzePostUrl,
  CATEGORY_PLATFORMS,
  categoryOf,
  CONTENT_TYPE_INFO,
  type ContentType,
  detectPlatform,
  type Platform,
  safeExternalUrl,
  VIDEO_RECLASSIFICATION,
} from "@/lib/platforms";

type ValidCase = [
  url: string,
  contentType: ContentType,
  externalId: string | null,
];

// Every accepted link format (§4.1 of the brief), with what it classifies as.
const VALID: ValidCase[] = [
  // TikTok: videos and short links (resolved on the server).
  [
    "https://www.tiktok.com/@nino.beridze/video/7412345678901234567",
    "tiktok_video",
    "7412345678901234567",
  ],
  [
    "https://www.tiktok.com/@crocobet_team/video/7412345678901234567?is_from_webapp=1&sender_device=pc",
    "tiktok_video",
    "7412345678901234567",
  ],
  [
    "https://m.tiktok.com/@nino-b/video/7412345678901234567",
    "tiktok_video",
    "7412345678901234567",
  ],
  // TikTok photo posts (slideshows) count on the video board, like videos.
  [
    "https://www.tiktok.com/@nino.beridze/photo/7412345678901234567?is_from_webapp=1",
    "tiktok_photo",
    "7412345678901234567",
  ],
  ["https://vm.tiktok.com/ZMabc123/", "tiktok_video", null],
  ["https://vt.tiktok.com/ZSxyz789/", "tiktok_video", null],
  ["https://www.tiktok.com/t/ZT8abcdEF/", "tiktok_video", null],
  // Instagram: reels (video) and /p/ posts (static unless the provider says it's a video).
  [
    "https://www.instagram.com/reel/C8xYz12AbCd/",
    "instagram_reel",
    "C8xYz12AbCd",
  ],
  ["https://instagram.com/reels/C8xYz12AbCd", "instagram_reel", "C8xYz12AbCd"],
  [
    "https://www.instagram.com/tv/B_tv-Code_1/",
    "instagram_reel",
    "B_tv-Code_1",
  ],
  [
    "https://m.instagram.com/reel/C8xYz12AbCd/?utm_source=ig_web_copy_link",
    "instagram_reel",
    "C8xYz12AbCd",
  ],
  [
    "https://www.instagram.com/nino.beridze/reel/C8xYz12AbCd/",
    "instagram_reel",
    "C8xYz12AbCd",
  ],
  ["instagram.com/reel/C8xYz12AbCd", "instagram_reel", "C8xYz12AbCd"],
  [
    "  https://www.instagram.com/reel/C8xYz12AbCd/  ",
    "instagram_reel",
    "C8xYz12AbCd",
  ],
  [
    "https://www.instagram.com/p/C8xYz12AbCd/?igsh=MWQ1ZGUxMzBkMA==",
    "instagram_photo",
    "C8xYz12AbCd",
  ],
  [
    "https://www.instagram.com/nino.beridze/p/C8xYz12AbCd/",
    "instagram_photo",
    "C8xYz12AbCd",
  ],
  // Facebook videos.
  [
    "https://www.facebook.com/watch/?v=1234567890123456",
    "facebook_video",
    "1234567890123456",
  ],
  [
    "https://www.facebook.com/watch?v=1234567890123456&ref=sharing",
    "facebook_video",
    "1234567890123456",
  ],
  [
    "https://www.facebook.com/reel/987654321098765",
    "facebook_video",
    "987654321098765",
  ],
  [
    "https://m.facebook.com/reel/987654321098765?mibextid=rS40aB7S9Ucbxw6v",
    "facebook_video",
    "987654321098765",
  ],
  [
    "https://www.facebook.com/CrocobetOfficial/videos/1122334455667788/",
    "facebook_video",
    "1122334455667788",
  ],
  [
    "https://www.facebook.com/CrocobetOfficial/videos/office-tour/1122334455667788/",
    "facebook_video",
    "1122334455667788",
  ],
  ["https://www.facebook.com/share/v/1AbCdEfGhI/", "facebook_video", null],
  [
    "https://www.facebook.com/share/r/15XyZ9AbCd/?mibextid=wwXIfr",
    "facebook_video",
    null,
  ],
  ["https://fb.watch/qWeRtY123/", "facebook_video", null],
  ["fb.watch/qWeRtY123", "facebook_video", null],
  // Facebook posts (static). The last two were rejected before and are valid now, on purpose.
  [
    "https://www.facebook.com/CrocobetOfficial/posts/pfbid02AbCdEfGh123456789",
    "facebook_post",
    "pfbid02AbCdEfGh123456789",
  ],
  [
    "https://www.facebook.com/nino.beridze/posts/1234567890123456",
    "facebook_post",
    "1234567890123456",
  ],
  [
    "https://www.facebook.com/permalink.php?story_fbid=pfbid0xyz&id=100012345678901",
    "facebook_post",
    "pfbid0xyz",
  ],
  [
    "https://www.facebook.com/story.php?story_fbid=1234567890&id=100012345678901&mibextid=x",
    "facebook_post",
    "1234567890",
  ],
  [
    "https://www.facebook.com/photo/?fbid=1029384756&set=a.123",
    "facebook_post",
    "1029384756",
  ],
  [
    "https://www.facebook.com/photo.php?fbid=1029384756",
    "facebook_post",
    "1029384756",
  ],
  [
    "https://www.facebook.com/CrocobetOfficial/photos/a.987654321/1122334455/",
    "facebook_post",
    "1122334455",
  ],
  [
    "https://www.facebook.com/CrocobetOfficial/photos/1122334455",
    "facebook_post",
    "1122334455",
  ],
  ["https://www.facebook.com/share/p/1AbCdEfGhI/", "facebook_post", null],
  // LinkedIn (always static). urn:li:share is accepted now too.
  [
    "https://www.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd",
    "linkedin_post",
    "activity:7212345678901234567",
  ],
  [
    "https://www.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd/?utm_source=share&utm_medium=member_desktop",
    "linkedin_post",
    "activity:7212345678901234567",
  ],
  [
    "https://www.linkedin.com/posts/crocobet_launch-ugcPost-7212345678901234568-Xy9Z",
    "linkedin_post",
    "ugcPost:7212345678901234568",
  ],
  [
    "https://www.linkedin.com/posts/nino-beridze_no-id-in-this-slug",
    "linkedin_post",
    null,
  ],
  [
    "https://www.linkedin.com/feed/update/urn:li:activity:7212345678901234567/",
    "linkedin_post",
    "activity:7212345678901234567",
  ],
  [
    "https://www.linkedin.com/feed/update/urn:li:ugcPost:7212345678901234567",
    "linkedin_post",
    "ugcPost:7212345678901234567",
  ],
  [
    "https://www.linkedin.com/feed/update/urn:li:share:7212345678901234567",
    "linkedin_post",
    "share:7212345678901234567",
  ],
  [
    "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7212345678901234567/",
    "linkedin_post",
    "activity:7212345678901234567",
  ],
  [
    "https://m.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd",
    "linkedin_post",
    "activity:7212345678901234567",
  ],
];

// Stories, profiles, feeds and TikTok photo posts: real content that doesn't count.
// (These were "not a post" before; they're unsupported-content now, on purpose.)
const UNSUPPORTED: Record<Platform, string[]> = {
  instagram: [
    "https://www.instagram.com/",
    "https://www.instagram.com/nino.beridze/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/reels/",
    "https://www.instagram.com/stories/nino.beridze/3412345678/",
    "https://www.instagram.com/stories/highlights/17912345678901234/",
  ],
  facebook: [
    "https://www.facebook.com/",
    "https://www.facebook.com/CrocobetOfficial",
    "https://www.facebook.com/watch/",
    "https://www.facebook.com/watch/?ref=sharing",
    "https://www.facebook.com/stories/123456789/UzpfSTEw/",
  ],
  tiktok: [
    "https://www.tiktok.com/",
    "https://www.tiktok.com/@nino.beridze",
    "https://www.tiktok.com/discover/office",
    "https://www.tiktok.com/@nino.beridze/live",
  ],
  linkedin: [
    "https://www.linkedin.com/",
    "https://www.linkedin.com/in/nino-beridze/",
    "https://www.linkedin.com/feed/",
    "https://www.linkedin.com/company/crocobet/",
  ],
};

// On a supported platform but not a post at all.
const NOT_A_POST: [string, Platform][] = [
  ["https://www.instagram.com/accounts/login/?next=%2F", "instagram"],
  ["https://www.facebook.com/groups/12345/posts/67890", "facebook"],
  ["https://www.facebook.com/permalink.php?story_fbid=123", "facebook"],
  ["https://www.facebook.com/photo/?set=a.123", "facebook"],
  ["https://www.tiktok.com/tag/crocobysquad", "tiktok"],
  ["https://www.linkedin.com/jobs/view/123456", "linkedin"],
  ["https://www.linkedin.com/pulse/some-article-nino-beridze", "linkedin"],
];

describe("analyzePostUrl", () => {
  it.each(VALID)("accepts %s as %s", (url, contentType, externalId) => {
    expect(analyzePostUrl(url)).toMatchObject({
      status: "valid",
      platform: CONTENT_TYPE_INFO[contentType].platform,
      contentType,
      category: CONTENT_TYPE_INFO[contentType].category,
      externalId,
      needsResolution: externalId === null && !url.includes("linkedin.com"),
    });
  });

  describe.each(Object.entries(UNSUPPORTED) as [Platform, string[]][])(
    "%s: content that doesn't count",
    (platform, urls) => {
      it.each(urls)("rejects %s", (url) => {
        expect(analyzePostUrl(url)).toEqual({
          status: "unsupported-content",
          platform,
        });
      });
    },
  );

  it.each(NOT_A_POST)("rejects %s (not a post)", (url, platform) => {
    expect(analyzePostUrl(url)).toEqual({ status: "not-a-post", platform });
  });

  it("puts each content type on the right board", () => {
    expect(CATEGORY_PLATFORMS.video).toEqual([
      "tiktok",
      "instagram",
      "facebook",
    ]);
    expect(CATEGORY_PLATFORMS.static).toEqual([
      "linkedin",
      "facebook",
      "instagram",
    ]);
    for (const [type, info] of Object.entries(CONTENT_TYPE_INFO)) {
      expect(CATEGORY_PLATFORMS[info.category]).toContain(info.platform);
      expect(categoryOf(type as ContentType)).toBe(info.category);
    }
    expect(VIDEO_RECLASSIFICATION).toEqual({
      instagram_photo: "instagram_reel",
      facebook_post: "facebook_video",
    });
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://x.com/crocobet/status/1234567890",
    "https://vimeo.com/123456",
    "https://example.com/reel/abc",
  ])("flags other platforms as unsupported: %s", (url) => {
    expect(analyzePostUrl(url)).toEqual({ status: "unsupported-platform" });
  });

  it.each([
    "https://instagram.com.evil.example/reel/C8xYz12AbCd",
    "https://notinstagram.com/reel/C8xYz12AbCd",
    "https://evil.example/instagram.com/reel/C8xYz12AbCd",
    "https://tiktok.com.attacker.io/@user/video/7412345678901234567",
    "https://api.linkedin.com/posts/nino-beridze_team-day-activity-1",
  ])("does not trust lookalike hosts: %s", (url) => {
    expect(analyzePostUrl(url)).toEqual({ status: "unsupported-platform" });
  });

  it.each([
    "not a link",
    "hello",
    "https://",
    "ftp://www.instagram.com/reel/abc",
    "javascript:alert(1)",
    "localhost/reel/abc",
  ])("rejects things that aren't web links: %s", (input) => {
    expect(analyzePostUrl(input)).toEqual({ status: "invalid-url" });
  });

  it.each(["", "   ", "\n"])("treats blank input as empty: %j", (input) => {
    expect(analyzePostUrl(input)).toEqual({ status: "empty" });
  });
});

describe("URL normalization", () => {
  const normalized = (url: string) => {
    const result = analyzePostUrl(url);
    if (result.status !== "valid")
      throw new Error(`Expected a valid link: ${url}`);
    return result.normalizedUrl;
  };

  it("strips www./m., trailing slashes and tracking params", () => {
    expect(
      normalized(
        "https://www.instagram.com/reel/C8xYz12AbCd/?igsh=MWQ1ZGUxMzBkMA==&utm_source=x",
      ),
    ).toBe("https://instagram.com/reel/C8xYz12AbCd");
    expect(
      normalized(
        "https://m.tiktok.com/@nino.beridze/video/7412345678901234567?is_from_webapp=1",
      ),
    ).toBe("https://tiktok.com/@nino.beridze/video/7412345678901234567");
    expect(
      normalized(
        "http://www.linkedin.com/posts/nino_x-activity-1-AbCd/?utm_medium=member_desktop",
      ),
    ).toBe("https://linkedin.com/posts/nino_x-activity-1-AbCd");
  });

  it("keeps the query params that identify the post", () => {
    expect(
      normalized(
        "https://www.facebook.com/watch/?v=1234567890&ref=sharing&fbclid=abc",
      ),
    ).toBe("https://facebook.com/watch?v=1234567890");
  });

  it("keeps case-sensitive IDs intact", () => {
    expect(normalized("https://www.instagram.com/p/AbC_dEf-123/")).toBe(
      "https://instagram.com/p/AbC_dEf-123",
    );
  });

  it("decodes encoded LinkedIn URNs", () => {
    expect(
      normalized(
        "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7212345678901234567/",
      ),
    ).toBe(
      "https://linkedin.com/feed/update/urn:li:activity:7212345678901234567",
    );
  });

  it("canonicalizes paths so link variants dedupe", () => {
    expect(normalized("https://www.instagram.com/reels/C8xYz12AbCd/")).toBe(
      "https://instagram.com/reel/C8xYz12AbCd",
    );
    expect(
      normalized("https://www.instagram.com/nino.beridze/reel/C8xYz12AbCd/"),
    ).toBe("https://instagram.com/reel/C8xYz12AbCd");
    expect(
      normalized(
        "https://www.linkedin.com/feed/update/urn:li:ugcpost:7212345678901234567",
      ),
    ).toBe(
      "https://linkedin.com/feed/update/urn:li:ugcPost:7212345678901234567",
    );
  });

  it("keeps only the identifying params, in a fixed order", () => {
    expect(
      normalized(
        "https://www.facebook.com/permalink.php?id=100012345678901&ref=x&story_fbid=987",
      ),
    ).toBe(
      "https://facebook.com/permalink.php?story_fbid=987&id=100012345678901",
    );
    expect(
      normalized(
        "https://www.facebook.com/photo/?fbid=1029384756&set=a.123&__tn__=x",
      ),
    ).toBe("https://facebook.com/photo?fbid=1029384756");
  });

  it("gives a LinkedIn post the same external ID in both URL forms", () => {
    const slug = analyzePostUrl(
      "https://www.linkedin.com/posts/nino_team-day-activity-7212345678901234567-AbCd",
    );
    const urn = analyzePostUrl(
      "https://www.linkedin.com/feed/update/urn:li:activity:7212345678901234567",
    );
    expect(
      slug.status === "valid" &&
        urn.status === "valid" &&
        slug.externalId === urn.externalId,
    ).toBe(true);
  });

  it("gives every variant of the same video the same URL", () => {
    const variants = [
      "https://www.tiktok.com/@nino.beridze/video/7412345678901234567",
      "tiktok.com/@nino.beridze/video/7412345678901234567/",
      "https://m.tiktok.com/@nino.beridze/video/7412345678901234567?lang=en&q=x",
      "HTTPS://WWW.TIKTOK.COM/@nino.beridze/video/7412345678901234567",
    ];
    expect(new Set(variants.map(normalized)).size).toBe(1);
  });
});

describe("detectPlatform", () => {
  it.each([
    ["https://www.instagram.com/", "instagram"],
    ["instagram.com/re", "instagram"],
    ["https://m.facebook.com/somepage", "facebook"],
    ["fb.watch", "facebook"],
    ["vm.tiktok.com/ZM", "tiktok"],
    ["https://www.linkedin.com/feed/", "linkedin"],
    ["https://youtube.com/watch?v=1", null],
    ["", null],
    ["not a url", null],
  ] as const)("%s -> %s", (input, expected) => {
    expect(detectPlatform(input)).toBe(expected);
  });
});

describe("safeExternalUrl", () => {
  it("allows http(s) links", () => {
    expect(safeExternalUrl("https://tiktok.com/@a/video/1")).toBe(
      "https://tiktok.com/@a/video/1",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "not a url",
    "",
    null,
    undefined,
  ])("blocks %j", (value) => {
    expect(safeExternalUrl(value)).toBeUndefined();
  });
});
