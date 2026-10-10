import type { PostStatus } from "@/lib/ranking";

/**
 * Moderation rules: admins approve every post before it counts, whether or
 * not the automated check passed (it's evidence for them), and can disqualify
 * approved posts at any time. Pure, so the mock API and the server
 * enforce exactly the same transitions.
 */

export const MODERATION_REASONS = [
  "missing_tag",
  "not_owner",
  "outside_challenge",
  "duplicate",
  "unavailable",
  "rule_violation",
  "spam",
  "fake_engagement",
  "other",
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

export const ADMIN_ACTIONS = [
  "approve",
  "reject",
  "disqualify",
  "reinstate",
  "reopen",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
export type ModerationAction = AdminAction | "withdraw" | "recheck";

export type CheckStatus = "queued" | "running" | "passed" | "failed" | "error";

export const RECHECK_COOLDOWN_MS = 10 * 60_000;
export const NOTE_MAX_LENGTH = 1000;

export interface ModerationInput {
  status: PostStatus;
  action: ModerationAction;
  actor: "admin" | "owner";
  reason?: ModerationReason | null;
  note?: string | null;
  lastRecheckAt?: Date | null;
  /** The check rejected the post by itself (not an admin): its owner can fix it and check again. */
  autoRejected?: boolean;
  now?: Date;
}

export type ModerationError =
  | "invalid_transition"
  | "forbidden"
  | "reason_required"
  | "note_required"
  | "rate_limited";

export type ModerationResult =
  | { ok: true; next: PostStatus | "deleted" }
  | { ok: false; error: ModerationError };

interface Rule {
  from: PostStatus | readonly PostStatus[];
  to: PostStatus | "deleted";
  who: readonly ("admin" | "owner")[];
}

const fromStatuses = (rule: Rule): readonly PostStatus[] =>
  typeof rule.from === "string" ? [rule.from] : rule.from;

const RULES: Record<ModerationAction, Rule> = {
  approve: { from: "pending", to: "approved", who: ["admin"] },
  reject: { from: "pending", to: "rejected", who: ["admin"] },
  disqualify: { from: "approved", to: "disqualified", who: ["admin"] },
  reinstate: { from: "disqualified", to: "approved", who: ["admin"] },
  reopen: { from: "rejected", to: "pending", who: ["admin"] },
  // Owners can delete their own posts whatever their status.
  withdraw: {
    from: ["pending", "approved", "rejected", "disqualified"],
    to: "deleted",
    who: ["owner"],
  },
  // A post the check rejected by itself goes back to pending for the new check.
  recheck: {
    from: ["pending", "rejected"],
    to: "pending",
    who: ["owner", "admin"],
  },
};

export function isModerationReason(value: unknown): value is ModerationReason {
  return (
    typeof value === "string" &&
    (MODERATION_REASONS as readonly string[]).includes(value)
  );
}

const hasNote = (note: string | null | undefined) => Boolean(note?.trim());

export function applyModeration(input: ModerationInput): ModerationResult {
  const rule = RULES[input.action];
  if (!rule.who.includes(input.actor)) return { ok: false, error: "forbidden" };
  if (!fromStatuses(rule).includes(input.status))
    return { ok: false, error: "invalid_transition" };

  switch (input.action) {
    case "approve":
      break;
    case "reject":
      if (!input.reason) return { ok: false, error: "reason_required" };
      break;
    case "disqualify":
      if (!input.reason) return { ok: false, error: "reason_required" };
      if (!hasNote(input.note)) return { ok: false, error: "note_required" };
      break;
    case "reinstate":
      if (!hasNote(input.note)) return { ok: false, error: "note_required" };
      break;
    case "recheck":
      if (input.status === "rejected" && !input.autoRejected)
        return { ok: false, error: "invalid_transition" };
      if (
        input.actor === "owner" &&
        input.lastRecheckAt &&
        (input.now ?? new Date()).getTime() - input.lastRecheckAt.getTime() <
          RECHECK_COOLDOWN_MS
      ) {
        return { ok: false, error: "rate_limited" };
      }
      break;
    default:
      break;
  }

  return { ok: true, next: rule.to };
}

/** Which admin actions make sense for a post in this status (for the UI). */
export function availableAdminActions(status: PostStatus): AdminAction[] {
  return ADMIN_ACTIONS.filter((action) =>
    fromStatuses(RULES[action]).includes(status),
  );
}
