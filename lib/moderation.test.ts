import { describe, expect, it } from "vitest";
import {
  applyModeration,
  availableAdminActions,
  type ModerationInput,
} from "@/lib/moderation";

const run = (
  input: Partial<ModerationInput> & Pick<ModerationInput, "status" | "action">,
) => applyModeration({ actor: "admin", ...input });

describe("allowed transitions", () => {
  it("approves a pending post in one step, whatever the check found", () => {
    // The check is evidence for the admin; their approval is what counts.
    expect(run({ status: "pending", action: "approve" })).toEqual({
      ok: true,
      next: "approved",
    });
  });

  it("rejects with a reason (note optional)", () => {
    expect(run({ status: "pending", action: "reject" })).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(
      run({ status: "pending", action: "reject", reason: "missing_tag" }),
    ).toEqual({ ok: true, next: "rejected" });
  });

  it("disqualifies an approved post with a reason and a note", () => {
    expect(
      run({
        status: "approved",
        action: "disqualify",
        reason: "fake_engagement",
      }),
    ).toEqual({ ok: false, error: "note_required" });
    expect(
      run({ status: "approved", action: "disqualify", note: "Bought views" }),
    ).toEqual({ ok: false, error: "reason_required" });
    expect(
      run({
        status: "approved",
        action: "disqualify",
        reason: "fake_engagement",
        note: "Bought views",
      }),
    ).toEqual({ ok: true, next: "disqualified" });
  });

  it("reinstates with a note", () => {
    expect(
      run({ status: "disqualified", action: "reinstate", note: "  " }),
    ).toEqual({ ok: false, error: "note_required" });
    expect(
      run({
        status: "disqualified",
        action: "reinstate",
        note: "Appeal accepted",
      }),
    ).toEqual({ ok: true, next: "approved" });
  });

  it("reopens a rejected post", () => {
    expect(run({ status: "rejected", action: "reopen" })).toEqual({
      ok: true,
      next: "pending",
    });
  });

  it("lets the owner delete their post, whatever its status", () => {
    for (const status of [
      "pending",
      "approved",
      "rejected",
      "disqualified",
    ] as const)
      expect(
        applyModeration({ status, action: "withdraw", actor: "owner" }),
      ).toEqual({ ok: true, next: "deleted" });
  });

  it("lets the owner re-check at most once every 10 minutes", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const recheck = (minutesAgo: number) =>
      applyModeration({
        status: "pending",
        action: "recheck",
        actor: "owner",
        lastRecheckAt: new Date(now.getTime() - minutesAgo * 60_000),
        now,
      });
    expect(recheck(9)).toEqual({ ok: false, error: "rate_limited" });
    expect(recheck(10)).toEqual({ ok: true, next: "pending" });
    expect(
      run({ status: "pending", action: "recheck", lastRecheckAt: now, now }),
    ).toEqual({ ok: true, next: "pending" });
  });
});

describe("re-checking a rejected post", () => {
  it("is allowed only when the check rejected it, and reopens it", () => {
    const recheck = (autoRejected: boolean) =>
      applyModeration({
        status: "rejected",
        action: "recheck",
        actor: "owner",
        autoRejected,
      });
    expect(recheck(true)).toEqual({ ok: true, next: "pending" });
    expect(recheck(false)).toEqual({ ok: false, error: "invalid_transition" });
  });
});

describe("refused transitions", () => {
  it.each([
    ["approved", "approve"],
    ["rejected", "approve"],
    ["pending", "disqualify"],
    ["rejected", "reinstate"],
    ["approved", "reopen"],
    ["disqualified", "reject"],
  ] as const)("%s → %s is invalid", (status, action) => {
    expect(run({ status, action, reason: "spam", note: "x" })).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("only owners withdraw and only admins moderate", () => {
    expect(run({ status: "pending", action: "withdraw" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      applyModeration({
        status: "pending",
        action: "approve",
        actor: "owner",
      }),
    ).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

it("lists the admin actions for each status", () => {
  expect(availableAdminActions("pending")).toEqual(["approve", "reject"]);
  expect(availableAdminActions("approved")).toEqual(["disqualify"]);
  expect(availableAdminActions("disqualified")).toEqual(["reinstate"]);
  expect(availableAdminActions("rejected")).toEqual(["reopen"]);
});
