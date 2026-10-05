import { describe, expect, it } from "vitest";
import { analyzePostUrl } from "@/lib/platforms";
import { MOCK_CURRENT_USER_ID, MOCK_EMPLOYEES, MOCK_POSTS } from "./data";

describe("mock data", () => {
  it("has about 25 employees, including the signed-in user", () => {
    expect(MOCK_EMPLOYEES).toHaveLength(25);
    expect(
      MOCK_EMPLOYEES.some((employee) => employee.id === MOCK_CURRENT_USER_ID),
    ).toBe(true);
  });

  it("only contains valid, already-normalized post links", () => {
    for (const post of MOCK_POSTS) {
      expect(analyzePostUrl(post.url)).toEqual({
        status: "valid",
        platform: post.platform,
        normalizedUrl: post.url,
      });
    }
  });

  it("has no duplicate links", () => {
    expect(new Set(MOCK_POSTS.map((post) => post.url)).size).toBe(
      MOCK_POSTS.length,
    );
  });

  it("only counts stats for verified posts", () => {
    for (const post of MOCK_POSTS.filter((v) => v.status !== "verified")) {
      expect(post.views).toBe(0);
      expect(post.reactions).toBe(0);
    }
  });
});
