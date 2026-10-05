import type { ChallengeWindow, Round, RoundsResponse } from "@/lib/api/types";
import {
  type CampaignWindow,
  monthRange,
  type Period,
  resolvePeriod,
  zonedTimeToUtc,
  zonedToday,
} from "@/lib/periods";

/**
 * Leaderboard rounds: weekly and monthly date ranges that admins define.
 * "This week" and "This month" show the round covering today; without
 * rounds of that kind, calendar weeks and months are used. Pure, so the mock
 * API and the server resolve them the same way.
 */

export const ROUND_KINDS = ["week", "month"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export interface RoundRange {
  id: string;
  kind: RoundKind;
  /** null: the UI shows an automatic label ("Week 3", "October"). */
  name: string | null;
  startsAt: Date;
  /** Exclusive. */
  endsAt: Date;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(date: string): [number, number, number] | null {
  const match = DATE.exec(date);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? [year, month, day]
    : null;
}

/** "2026-10-06" plus `days`, as a calendar date. */
export function addDays(date: string, days: number): string {
  const parts = parseDate(date);
  if (!parts) throw new Error(`Invalid date: ${date}`);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days))
    .toISOString()
    .slice(0, 10);
}

/** 00:00 of a calendar day (YYYY-MM-DD) in the time zone, or null if it isn't a real date. */
export function startOfDay(date: string, timeZone: string): Date | null {
  const parts = parseDate(date);
  return parts
    ? zonedTimeToUtc(parts[0], parts[1], parts[2], 0, 0, timeZone)
    : null;
}

/** Whole days, inclusive: [startDate 00:00, the day after endDate 00:00). */
export function dayRange(
  startDate: string,
  endDate: string,
  timeZone: string,
): { startsAt: Date; endsAt: Date } | null {
  const startsAt = startOfDay(startDate, timeZone);
  const endsAt = parseDate(endDate)
    ? startOfDay(addDays(endDate, 1), timeZone)
    : null;
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}

/** The inclusive calendar dates of a range. */
export function rangeDates(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): { startDate: string; endDate: string } {
  return {
    startDate: zonedToday(startsAt, timeZone),
    endDate: zonedToday(new Date(endsAt.getTime() - 1), timeZone),
  };
}

const byStart = (a: RoundRange, b: RoundRange) =>
  a.startsAt.getTime() - b.startsAt.getTime();

/** Each round's 1-based position among the rounds of its kind, by start. */
export function roundNumbers(
  rounds: readonly RoundRange[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const kind of ROUND_KINDS)
    rounds
      .filter((round) => round.kind === kind)
      .sort(byStart)
      .forEach((round, index) => numbers.set(round.id, index + 1));
  return numbers;
}

/**
 * The round a "This week" / "This month" board shows at `reference`: the
 * one covering it, else the first one (before the rounds start) or the last
 * one that has started (between or after rounds).
 */
export function currentRound(
  kind: RoundKind,
  rounds: readonly RoundRange[],
  reference: Date,
): RoundRange | null {
  const ofKind = rounds.filter((round) => round.kind === kind).sort(byStart);
  if (ofKind.length === 0) return null;
  return (
    ofKind.find(
      (round) => round.startsAt <= reference && reference < round.endsAt,
    ) ??
    ofKind.filter((round) => round.startsAt <= reference).at(-1) ??
    ofKind[0]!
  );
}

export interface BoardRange {
  start: Date;
  /** Exclusive. */
  end: Date;
  isCurrent: boolean;
  round: RoundRange | null;
}

/**
 * The dates a board covers. A chosen round (by id) wins; otherwise the
 * current round of that kind; otherwise the calendar week or month.
 * Everything is intersected with the challenge window.
 */
export function resolveBoardRange(
  period: Period,
  {
    roundId = null,
    reference,
    now = reference,
    campaign,
    rounds,
  }: {
    roundId?: string | null;
    reference: Date;
    now?: Date;
    campaign: CampaignWindow;
    rounds: readonly RoundRange[];
  },
): BoardRange {
  const round =
    period === "all"
      ? null
      : ((roundId
          ? rounds.find(
              (candidate) =>
                candidate.id === roundId && candidate.kind === period,
            )
          : undefined) ?? currentRound(period, rounds, reference));

  if (!round) {
    const range = resolvePeriod(period, reference, campaign);
    return {
      start: range.start,
      end: range.end,
      isCurrent: now >= range.start && now < range.end,
      round: null,
    };
  }
  const start = new Date(
    Math.max(round.startsAt.getTime(), campaign.startsAt.getTime()),
  );
  const end = new Date(
    Math.max(
      start.getTime(),
      Math.min(round.endsAt.getTime(), campaign.endsAt.getTime()),
    ),
  );
  return { start, end, isCurrent: now >= start && now < end, round };
}

export type RoundProblem = "invalid_dates" | "outside_challenge" | "overlap";

/** Why a round can't be saved, or null. Rounds of one kind never overlap. */
export function roundProblem(
  candidate: { id?: string; kind: RoundKind; startsAt: Date; endsAt: Date },
  rounds: readonly RoundRange[],
  campaign: CampaignWindow,
): RoundProblem | null {
  if (!(candidate.endsAt > candidate.startsAt)) return "invalid_dates";
  if (
    candidate.startsAt < campaign.startsAt ||
    candidate.endsAt > campaign.endsAt
  )
    return "outside_challenge";
  const overlaps = rounds.some(
    (round) =>
      round.id !== candidate.id &&
      round.kind === candidate.kind &&
      round.startsAt < candidate.endsAt &&
      candidate.startsAt < round.endsAt,
  );
  return overlaps ? "overlap" : null;
}

/**
 * Rounds covering the whole challenge: consecutive 7-day weeks from its first
 * day, or calendar months (the first and last clipped to the challenge).
 */
export function generateRounds(
  kind: RoundKind,
  campaign: CampaignWindow,
): { kind: RoundKind; startsAt: Date; endsAt: Date }[] {
  const { startsAt, endsAt, timeZone } = campaign;
  const generated: { kind: RoundKind; startsAt: Date; endsAt: Date }[] = [];
  if (kind === "week") {
    let day = zonedToday(startsAt, timeZone);
    let start = startsAt;
    while (start < endsAt) {
      day = addDays(day, 7);
      const next = startOfDay(day, timeZone)!;
      const end = next < endsAt ? next : endsAt;
      generated.push({ kind, startsAt: start, endsAt: end });
      start = end;
    }
    return generated;
  }
  let cursor = startsAt;
  while (cursor < endsAt) {
    const month = monthRange(cursor, timeZone);
    const start = cursor;
    const end = month.end < endsAt ? month.end : endsAt;
    if (end > start) generated.push({ kind, startsAt: start, endsAt: end });
    cursor = month.end;
  }
  return generated;
}

const KIND_ORDER = (a: RoundRange, b: RoundRange) =>
  ROUND_KINDS.indexOf(a.kind) - ROUND_KINDS.indexOf(b.kind) ||
  a.startsAt.getTime() - b.startsAt.getTime();

/** The API's view of the challenge window. */
export function toChallengeWindow(
  campaign: CampaignWindow,
  source: ChallengeWindow["source"],
): ChallengeWindow {
  return {
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    ...rangeDates(campaign.startsAt, campaign.endsAt, campaign.timeZone),
    timeZone: campaign.timeZone,
    source,
  };
}

/** The API's list of rounds: weekly, then monthly, each by start, numbered. */
export function toRoundsResponse(
  rounds: readonly RoundRange[],
  campaign: CampaignWindow,
  source: ChallengeWindow["source"],
): RoundsResponse {
  const numbers = roundNumbers(rounds);
  return {
    challenge: toChallengeWindow(campaign, source),
    rounds: [...rounds].sort(KIND_ORDER).map((round): Round => ({
      id: round.id,
      kind: round.kind,
      name: round.name,
      number: numbers.get(round.id) ?? 1,
      startsAt: round.startsAt.toISOString(),
      endsAt: round.endsAt.toISOString(),
      ...rangeDates(round.startsAt, round.endsAt, campaign.timeZone),
    })),
  };
}

/** Error codes for round problems, shared by the server and the mock API. */
export const ROUND_PROBLEM_CODES = {
  invalid_dates: "invalid_dates",
  outside_challenge: "outside_challenge",
  overlap: "round_overlap",
} as const satisfies Record<RoundProblem, string>;
