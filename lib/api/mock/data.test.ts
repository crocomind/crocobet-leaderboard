import { describe, expect, it } from "vitest";
import {
  analyzePostUrl,
  CONTENT_TYPES,
  VIDEO_RECLASSIFICATION,
} from "@/lib/platforms";
import { POST_FLAGS } from "../types";
import {
  createInitialState,
  MOCK_CURRENT_USER_ID,
  MOCK_EMPLOYEES,
} from "./data";

const now = new Date("2026-10-05T10:30:00Z");
const state = createInitialState(now);

describe("mock data", () => {
  it("has about 25 employees with first and last names, including the signed-in user", () => {
    expect(MOCK_EMPLOYEES).toHaveLength(25);
    expect(
      MOCK_EMPLOYEES.some((employee) => employee.id === MOCK_CURRENT_USER_ID),
    ).toBe(true);
    for (const employee of MOCK_EMPLOYEES) {
      expect(employee.firstName).toBeTruthy();
      expect(employee.lastName).toBeTruthy();
    }
  });

  it("is deterministic for a given time", () => {
    expect(createInitialState(now)).toEqual(state);
  });

  it("only contains valid, already-normalized post links", () => {
    for (const post of state.posts) {
      const analysis = analyzePostUrl(post.url);
      expect(analysis).toMatchObject({
        status: "valid",
        platform: post.platform,
        normalizedUrl: post.url,
        needsResolution: false,
      });
      if (analysis.status !== "valid") continue;
      // Reclassified photo links moved to the video type.
      expect([
        analysis.contentType,
        VIDEO_RECLASSIFICATION[analysis.contentType],
      ]).toContain(post.contentType);
    }
  });

  it("has no duplicate links", () => {
    expect(new Set(state.posts.map((post) => post.url)).size).toBe(
      state.posts.length,
    );
  });

  it("covers every content type, status, check result and flag", () => {
    const seen = (values: string[]) => new Set(values);
    expect(seen(state.posts.map((post) => post.contentType))).toEqual(
      new Set(CONTENT_TYPES),
    );
    expect(seen(state.posts.map((post) => post.status))).toEqual(
      new Set(["pending", "approved", "rejected", "disqualified"]),
    );
    expect(seen(state.posts.map((post) => post.check.status))).toEqual(
      new Set(["queued", "passed", "failed", "error"]),
    );
    expect(seen(state.posts.flatMap((post) => post.flags))).toEqual(
      new Set(POST_FLAGS),
    );
  });

  it("gives the signed-in user posts in every status", () => {
    const mine = state.posts.filter(
      (post) => post.employeeId === MOCK_CURRENT_USER_ID,
    );
    expect(new Set(mine.map((post) => post.status))).toEqual(
      new Set(["pending", "approved", "rejected", "disqualified"]),
    );
    expect(new Set(mine.map((post) => post.check.status))).toEqual(
      new Set(["queued", "passed", "failed", "error"]),
    );
  });

  it("only approves a post whose check failed with an override and a note", () => {
    for (const post of state.posts.filter(
      (candidate) =>
        candidate.status === "approved" && candidate.check.status !== "passed",
    )) {
      const approval = post.events.findLast((event) =>
        event.action.startsWith("approve"),
      );
      // Approved posts can lose their tag (or become unreachable) later.
      if (approval?.action === "approve") {
        expect(
          post.flags.some((flag) =>
            ["tag_removed", "unavailable"].includes(flag),
          ),
        ).toBe(true);
      } else {
        expect(approval).toMatchObject({ action: "approve_override" });
        expect(approval?.note).toBeTruthy();
      }
    }
  });

  it("keeps views off static posts and records snapshots oldest first", () => {
    for (const post of state.posts) {
      const sorted = [...post.snapshots].sort((a, b) =>
        a.fetchedAt.localeCompare(b.fetchedAt),
      );
      expect(post.snapshots).toEqual(sorted);
      if (post.check.status === "queued") expect(post.snapshots).toEqual([]);
    }
  });

  it("only links handles from approved posts", () => {
    for (const account of state.socialAccounts) {
      expect(
        state.posts.some(
          (post) =>
            post.employeeId === account.employeeId &&
            post.platform === account.platform &&
            post.approvedAt !== null,
        ),
      ).toBe(true);
    }
  });
});
