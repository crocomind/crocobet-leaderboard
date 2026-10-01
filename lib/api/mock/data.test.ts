import { describe, expect, it } from "vitest";
import { analyzeVideoUrl } from "@/lib/platforms";
import { MOCK_CURRENT_USER_ID, MOCK_EMPLOYEES, MOCK_VIDEOS } from "./data";

describe("mock data", () => {
  it("has about 25 employees, including the signed-in user", () => {
    expect(MOCK_EMPLOYEES).toHaveLength(25);
    expect(
      MOCK_EMPLOYEES.some((employee) => employee.id === MOCK_CURRENT_USER_ID),
    ).toBe(true);
  });

  it("only contains valid, already-normalized video links", () => {
    for (const video of MOCK_VIDEOS) {
      expect(analyzeVideoUrl(video.url)).toEqual({
        status: "valid",
        platform: video.platform,
        normalizedUrl: video.url,
      });
    }
  });

  it("has no duplicate links", () => {
    expect(new Set(MOCK_VIDEOS.map((video) => video.url)).size).toBe(
      MOCK_VIDEOS.length,
    );
  });

  it("only counts stats for verified videos", () => {
    for (const video of MOCK_VIDEOS.filter((v) => v.status !== "verified")) {
      expect(video.views).toBe(0);
      expect(video.reactions).toBe(0);
    }
  });
});
