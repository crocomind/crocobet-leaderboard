import { describe, expect, it } from "vitest";
import {
  analyzeVideoUrl,
  detectPlatform,
  type Platform,
  safeExternalUrl,
} from "@/lib/platforms";

const VALID: Record<Platform, string[]> = {
  instagram: [
    "https://www.instagram.com/reel/C8xYz12AbCd/",
    "https://instagram.com/reels/C8xYz12AbCd",
    "https://www.instagram.com/p/C8xYz12AbCd/?igsh=MWQ1ZGUxMzBkMA==",
    "https://www.instagram.com/tv/B_tv-Code_1/",
    "https://m.instagram.com/reel/C8xYz12AbCd/?utm_source=ig_web_copy_link",
    "instagram.com/reel/C8xYz12AbCd",
    "  https://www.instagram.com/reel/C8xYz12AbCd/  ",
  ],
  facebook: [
    "https://www.facebook.com/watch/?v=1234567890123456",
    "https://www.facebook.com/watch?v=1234567890123456&ref=sharing",
    "https://www.facebook.com/reel/987654321098765",
    "https://m.facebook.com/reel/987654321098765?mibextid=rS40aB7S9Ucbxw6v",
    "https://www.facebook.com/CrocobetOfficial/videos/1122334455667788/",
    "https://www.facebook.com/CrocobetOfficial/videos/office-tour/1122334455667788/",
    "https://www.facebook.com/share/v/1AbCdEfGhI/",
    "https://www.facebook.com/share/r/15XyZ9AbCd/?mibextid=wwXIfr",
    "https://fb.watch/qWeRtY123/",
    "fb.watch/qWeRtY123",
  ],
  tiktok: [
    "https://www.tiktok.com/@nino.beridze/video/7412345678901234567",
    "https://www.tiktok.com/@crocobet_team/video/7412345678901234567?is_from_webapp=1&sender_device=pc",
    "https://m.tiktok.com/@nino-b/video/7412345678901234567",
    "https://vm.tiktok.com/ZMabc123/",
    "https://vt.tiktok.com/ZSxyz789/",
    "https://www.tiktok.com/t/ZT8abcdEF/",
  ],
  linkedin: [
    "https://www.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd",
    "https://www.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd/?utm_source=share&utm_medium=member_desktop",
    "https://www.linkedin.com/feed/update/urn:li:activity:7212345678901234567/",
    "https://www.linkedin.com/feed/update/urn:li:ugcPost:7212345678901234567",
    "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7212345678901234567/",
    "https://m.linkedin.com/posts/nino-beridze_team-day-activity-7212345678901234567-AbCd",
  ],
};

const NOT_A_VIDEO: Record<Platform, string[]> = {
  instagram: [
    "https://www.instagram.com/",
    "https://www.instagram.com/nino.beridze/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/reels/",
    "https://www.instagram.com/stories/nino.beridze/3412345678/",
  ],
  facebook: [
    "https://www.facebook.com/",
    "https://www.facebook.com/CrocobetOfficial",
    "https://www.facebook.com/watch/",
    "https://www.facebook.com/watch/?ref=sharing",
    "https://www.facebook.com/CrocobetOfficial/photos/1122334455",
    "https://www.facebook.com/share/p/1AbCdEfGhI/",
  ],
  tiktok: [
    "https://www.tiktok.com/",
    "https://www.tiktok.com/@nino.beridze",
    "https://www.tiktok.com/@nino.beridze/photo/7412345678901234567",
    "https://www.tiktok.com/discover/office",
  ],
  linkedin: [
    "https://www.linkedin.com/",
    "https://www.linkedin.com/in/nino-beridze/",
    "https://www.linkedin.com/feed/",
    "https://www.linkedin.com/company/crocobet/",
    "https://www.linkedin.com/feed/update/urn:li:share:7212345678901234567",
  ],
};

describe("analyzeVideoUrl", () => {
  describe.each(Object.entries(VALID) as [Platform, string[]][])(
    "%s: valid links",
    (platform, urls) => {
      it.each(urls)("accepts %s", (url) => {
        const result = analyzeVideoUrl(url);
        expect(result).toMatchObject({ status: "valid", platform });
      });
    },
  );

  describe.each(Object.entries(NOT_A_VIDEO) as [Platform, string[]][])(
    "%s: links that aren't a video or post",
    (platform, urls) => {
      it.each(urls)("rejects %s", (url) => {
        expect(analyzeVideoUrl(url)).toEqual({
          status: "not-a-video",
          platform,
        });
      });
    },
  );

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://x.com/crocobet/status/1234567890",
    "https://vimeo.com/123456",
    "https://example.com/reel/abc",
  ])("flags other platforms as unsupported: %s", (url) => {
    expect(analyzeVideoUrl(url)).toEqual({ status: "unsupported-platform" });
  });

  it.each([
    "https://instagram.com.evil.example/reel/C8xYz12AbCd",
    "https://notinstagram.com/reel/C8xYz12AbCd",
    "https://evil.example/instagram.com/reel/C8xYz12AbCd",
    "https://tiktok.com.attacker.io/@user/video/7412345678901234567",
    "https://api.linkedin.com/posts/nino-beridze_team-day-activity-1",
  ])("does not trust lookalike hosts: %s", (url) => {
    expect(analyzeVideoUrl(url)).toEqual({ status: "unsupported-platform" });
  });

  it.each([
    "not a link",
    "hello",
    "https://",
    "ftp://www.instagram.com/reel/abc",
    "javascript:alert(1)",
    "localhost/reel/abc",
  ])("rejects things that aren't web links: %s", (input) => {
    expect(analyzeVideoUrl(input)).toEqual({ status: "invalid-url" });
  });

  it.each(["", "   ", "\n"])("treats blank input as empty: %j", (input) => {
    expect(analyzeVideoUrl(input)).toEqual({ status: "empty" });
  });
});

describe("URL normalization", () => {
  const normalized = (url: string) => {
    const result = analyzeVideoUrl(url);
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

  it("keeps the query params that identify the video", () => {
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
