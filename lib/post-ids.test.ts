import { describe, expect, it } from "vitest";
import { publishedAtFromExternalId } from "@/lib/post-ids";

const NOW = new Date("2026-10-05T12:00:00Z");

// Build IDs the way the platforms do, so the decoding is checked both ways.
const tiktokId = (date: Date) =>
  ((BigInt(Math.floor(date.getTime() / 1000)) << 32n) | 123456n).toString();
const linkedInId = (date: Date) =>
  ((BigInt(date.getTime()) << 22n) | 98765n).toString();

describe("publishedAtFromExternalId", () => {
  it("decodes TikTok video IDs (top 32 bits = Unix seconds)", () => {
    const date = new Date("2026-09-30T08:15:42Z");
    expect(
      publishedAtFromExternalId("tiktok_video", tiktokId(date), NOW),
    ).toEqual(date);
  });

  it("decodes a real-shaped TikTok ID to a plausible date", () => {
    // 74… IDs were issued around September 2024.
    const decoded = publishedAtFromExternalId(
      "tiktok_video",
      "7412345678901234567",
      NOW,
    );
    expect(decoded?.toISOString().slice(0, 7)).toBe("2024-09");
  });

  it("decodes LinkedIn activity and ugcPost IDs (top 41 of 63 bits = Unix ms)", () => {
    const date = new Date("2026-10-01T09:30:00.123Z");
    expect(
      publishedAtFromExternalId(
        "linkedin_post",
        `activity:${linkedInId(date)}`,
        NOW,
      ),
    ).toEqual(date);
    expect(
      publishedAtFromExternalId(
        "linkedin_post",
        `ugcPost:${linkedInId(date)}`,
        NOW,
      ),
    ).toEqual(date);
  });

  it("decodes a real-shaped LinkedIn ID to a plausible date", () => {
    // 72… activity IDs were issued around mid-2024.
    const decoded = publishedAtFromExternalId(
      "linkedin_post",
      "activity:7212345678901234567",
      NOW,
    );
    expect(decoded?.toISOString().slice(0, 4)).toBe("2024");
  });

  it("returns null when the ID doesn't encode a date", () => {
    expect(
      publishedAtFromExternalId("instagram_reel", "C8xYz12AbCd", NOW),
    ).toBeNull();
    expect(
      publishedAtFromExternalId("facebook_post", "1234567890", NOW),
    ).toBeNull();
    expect(
      publishedAtFromExternalId(
        "linkedin_post",
        "share:7212345678901234567",
        NOW,
      ),
    ).toBeNull();
    expect(publishedAtFromExternalId("tiktok_video", null, NOW)).toBeNull();
    expect(
      publishedAtFromExternalId("tiktok_video", "not-a-number", NOW),
    ).toBeNull();
  });

  it("rejects implausible dates (far future or before 2016)", () => {
    expect(
      publishedAtFromExternalId(
        "tiktok_video",
        tiktokId(new Date("2030-01-01")),
        NOW,
      ),
    ).toBeNull();
    expect(
      publishedAtFromExternalId("tiktok_video", "123456789012345", NOW),
    ).toBeNull();
  });
});
