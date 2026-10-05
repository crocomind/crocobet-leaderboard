import { describe, expect, it } from "vitest";
import { displayedViews, postScore } from "@/lib/scoring";

describe("postScore", () => {
  it("adds views and reactions on video", () => {
    expect(postScore("video", 1000, 50)).toBe(1050);
  });

  it("counts reactions only on static content, ignoring views", () => {
    expect(postScore("static", 999_999, 40)).toBe(40);
    expect(postScore("static", null, 40)).toBe(40);
  });

  it("scores unknown video views as 0 until an admin enters them", () => {
    expect(postScore("video", null, 12)).toBe(12);
  });

  it("never goes negative (hidden counts can come back as -1)", () => {
    expect(postScore("video", -1, -1)).toBe(0);
  });

  it("hides views on static content", () => {
    expect(displayedViews("static", 500)).toBeNull();
    expect(displayedViews("video", 500)).toBe(500);
  });
});
