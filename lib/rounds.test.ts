import { describe, expect, it } from "vitest";
import {
  addDays,
  currentRound,
  dayRange,
  generateRounds,
  rangeDates,
  resolveBoardRange,
  type RoundRange,
  roundNumbers,
  roundProblem,
  startOfDay,
} from "@/lib/rounds";

const TZ = "Asia/Tbilisi";
const campaign = {
  startsAt: new Date("2026-10-06T00:00:00+04:00"),
  endsAt: new Date("2027-01-06T00:00:00+04:00"),
  timeZone: TZ,
};
const at = (iso: string) => new Date(iso);
const round = (
  id: string,
  kind: RoundRange["kind"],
  startDate: string,
  endDate: string,
): RoundRange => ({
  id,
  kind,
  name: null,
  ...dayRange(startDate, endDate, TZ)!,
});

const weeks = [
  round("w1", "week", "2026-10-06", "2026-10-12"),
  round("w2", "week", "2026-10-13", "2026-10-19"),
  // A gap: no round from 20 to 26 October.
  round("w3", "week", "2026-10-27", "2026-11-02"),
];

describe("calendar dates", () => {
  it("turns whole days in Tbilisi into instants and back", () => {
    expect(startOfDay("2026-10-06", TZ)).toEqual(at("2026-10-05T20:00:00Z"));
    expect(startOfDay("2026-02-30", TZ)).toBeNull();
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    const range = dayRange("2026-10-06", "2026-10-12", TZ)!;
    expect(range).toEqual({
      startsAt: at("2026-10-05T20:00:00Z"),
      endsAt: at("2026-10-12T20:00:00Z"),
    });
    expect(rangeDates(range.startsAt, range.endsAt, TZ)).toEqual({
      startDate: "2026-10-06",
      endDate: "2026-10-12",
    });
  });
});

describe("currentRound and resolveBoardRange", () => {
  it("shows the round covering today", () => {
    expect(
      currentRound("week", weeks, at("2026-10-15T12:00:00+04:00"))?.id,
    ).toBe("w2");
    // Sunday 23:59 belongs to w2, Monday 00:00 to nothing (the gap) → the last started round.
    expect(
      currentRound("week", weeks, at("2026-10-19T23:59:00+04:00"))?.id,
    ).toBe("w2");
    expect(
      currentRound("week", weeks, at("2026-10-21T12:00:00+04:00"))?.id,
    ).toBe("w2");
    expect(
      currentRound("week", weeks, at("2026-09-01T12:00:00+04:00"))?.id,
    ).toBe("w1");
    expect(
      currentRound("week", weeks, at("2026-12-01T12:00:00+04:00"))?.id,
    ).toBe("w3");
    expect(
      currentRound("month", weeks, at("2026-10-15T12:00:00+04:00")),
    ).toBeNull();
  });

  it("uses a chosen round, the current one, or the calendar", () => {
    const now = at("2026-10-15T12:00:00+04:00");
    const chosen = resolveBoardRange("week", {
      roundId: "w1",
      reference: now,
      campaign,
      rounds: weeks,
    });
    expect(chosen).toMatchObject({ round: { id: "w1" }, isCurrent: false });
    expect(chosen.start).toEqual(at("2026-10-06T00:00:00+04:00"));

    const current = resolveBoardRange("week", {
      reference: now,
      campaign,
      rounds: weeks,
    });
    expect(current).toMatchObject({ round: { id: "w2" }, isCurrent: true });

    // A round id of another kind is ignored.
    expect(
      resolveBoardRange("month", {
        roundId: "w1",
        reference: now,
        campaign,
        rounds: weeks,
      }),
    ).toMatchObject({
      round: null,
      start: at("2026-10-06T00:00:00+04:00"),
      end: at("2026-11-01T00:00:00+04:00"),
    });
    expect(
      resolveBoardRange("all", {
        roundId: "w1",
        reference: now,
        campaign,
        rounds: weeks,
      }),
    ).toMatchObject({
      round: null,
      start: campaign.startsAt,
      end: campaign.endsAt,
    });
  });

  it("clips a round to the challenge", () => {
    const wide = round("m1", "month", "2026-10-01", "2026-10-31");
    const range = resolveBoardRange("month", {
      reference: at("2026-10-10T00:00:00Z"),
      campaign,
      rounds: [wide],
    });
    expect(range.start).toEqual(campaign.startsAt);
    expect(range.end).toEqual(at("2026-11-01T00:00:00+04:00"));
  });
});

describe("roundProblem", () => {
  it("refuses bad dates, rounds outside the challenge and overlaps of one kind", () => {
    const check = (
      startDate: string,
      endDate: string,
      kind: RoundRange["kind"] = "week",
      id?: string,
    ) =>
      roundProblem(
        { id, kind, ...dayRange(startDate, endDate, TZ)! },
        weeks,
        campaign,
      );
    expect(check("2026-10-20", "2026-10-26")).toBeNull();
    expect(check("2026-10-12", "2026-10-06")).toBe("invalid_dates");
    expect(check("2026-10-01", "2026-10-05")).toBe("outside_challenge");
    expect(check("2027-01-01", "2027-01-08")).toBe("outside_challenge");
    expect(check("2026-10-19", "2026-10-25")).toBe("overlap");
    // The same dates as a monthly round, or editing w2 itself, are fine.
    expect(check("2026-10-13", "2026-10-19", "month")).toBeNull();
    expect(check("2026-10-13", "2026-10-20", "week", "w2")).toBeNull();
  });
});

describe("generateRounds", () => {
  it("cuts the challenge into weeks from its first day", () => {
    const generated = generateRounds("week", campaign);
    expect(generated).toHaveLength(14);
    expect(
      rangeDates(generated[0]!.startsAt, generated[0]!.endsAt, TZ),
    ).toEqual({
      startDate: "2026-10-06",
      endDate: "2026-10-12",
    });
    const last = generated.at(-1)!;
    expect(rangeDates(last.startsAt, last.endsAt, TZ)).toEqual({
      startDate: "2027-01-05",
      endDate: "2027-01-05",
    });
    // Back to back, no gaps.
    for (let i = 1; i < generated.length; i++)
      expect(generated[i]!.startsAt).toEqual(generated[i - 1]!.endsAt);
  });

  it("cuts the challenge into calendar months", () => {
    const generated = generateRounds("month", campaign).map((item) =>
      rangeDates(item.startsAt, item.endsAt, TZ),
    );
    expect(generated).toEqual([
      { startDate: "2026-10-06", endDate: "2026-10-31" },
      { startDate: "2026-11-01", endDate: "2026-11-30" },
      { startDate: "2026-12-01", endDate: "2026-12-31" },
      { startDate: "2027-01-01", endDate: "2027-01-05" },
    ]);
  });

  it("numbers rounds within their kind", () => {
    const numbers = roundNumbers([
      weeks[2]!,
      round("m1", "month", "2026-10-06", "2026-10-31"),
      weeks[0]!,
      weeks[1]!,
    ]);
    expect(Object.fromEntries(numbers)).toEqual({ w1: 1, w2: 2, w3: 3, m1: 1 });
  });
});
