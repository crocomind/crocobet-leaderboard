import { describe, expect, it } from "vitest";
import {
  type CampaignWindow,
  isWithin,
  metricsRefreshOpen,
  monthRange,
  postedDateToInstant,
  resolvePeriod,
  submissionsOpen,
  weekRange,
  zonedTimeToUtc,
  zonedToday,
} from "@/lib/periods";

const TZ = "Asia/Tbilisi"; // UTC+4, no DST
const campaign: CampaignWindow = {
  startsAt: new Date("2026-10-06T00:00:00+04:00"),
  endsAt: new Date("2027-01-06T00:00:00+04:00"),
  timeZone: TZ,
};
const at = (iso: string) => new Date(iso);

describe("time-zone helpers", () => {
  it("converts Tbilisi wall-clock time to UTC", () => {
    expect(zonedTimeToUtc(2026, 10, 12, 0, 0, TZ).toISOString()).toBe(
      "2026-10-11T20:00:00.000Z",
    );
  });

  it("handles DST zones (Europe/Berlin spring-forward week)", () => {
    const { start, end } = weekRange(
      at("2026-03-29T12:00:00Z"),
      "Europe/Berlin",
    );
    expect(start.toISOString()).toBe("2026-03-22T23:00:00.000Z"); // Mon 00:00 CET
    expect(end.toISOString()).toBe("2026-03-29T22:00:00.000Z"); // Mon 00:00 CEST
  });

  it("reads a submitter's date as 12:00 in Tbilisi", () => {
    expect(postedDateToInstant("2026-10-07", TZ)?.toISOString()).toBe(
      "2026-10-07T08:00:00.000Z",
    );
    expect(postedDateToInstant("07/10/2026", TZ)).toBeNull();
  });

  it("gives today's date in the campaign time zone, not UTC", () => {
    expect(zonedToday(at("2026-10-05T21:30:00Z"), TZ)).toBe("2026-10-06");
  });
});

describe("weeks", () => {
  it("runs Monday 00:00 to the next Monday 00:00 in Tbilisi", () => {
    const { start, end } = weekRange(at("2026-10-14T10:00:00+04:00"), TZ);
    expect(start).toEqual(at("2026-10-12T00:00:00+04:00"));
    expect(end).toEqual(at("2026-10-19T00:00:00+04:00"));
  });

  it("puts Sunday 23:59:59 and Monday 00:00 in different weeks", () => {
    const sunday = weekRange(at("2026-10-18T23:59:59+04:00"), TZ);
    const monday = weekRange(at("2026-10-19T00:00:00+04:00"), TZ);
    expect(sunday.start).toEqual(at("2026-10-12T00:00:00+04:00"));
    expect(monday.start).toEqual(at("2026-10-19T00:00:00+04:00"));
  });

  it("uses Tbilisi's date even when UTC is still on Sunday", () => {
    // 20:30 UTC Sunday is already Monday 00:30 in Tbilisi.
    expect(weekRange(at("2026-10-18T20:30:00Z"), TZ).start).toEqual(
      at("2026-10-19T00:00:00+04:00"),
    );
  });
});

describe("months", () => {
  it("runs from the 1st to the next 1st, across year ends", () => {
    const { start, end } = monthRange(at("2026-12-31T23:59:59+04:00"), TZ);
    expect(start).toEqual(at("2026-12-01T00:00:00+04:00"));
    expect(end).toEqual(at("2027-01-01T00:00:00+04:00"));
  });

  it("starts a new month at 00:00 on the 1st, Tbilisi time", () => {
    expect(monthRange(at("2026-11-01T00:00:00+04:00"), TZ).start).toEqual(
      at("2026-11-01T00:00:00+04:00"),
    );
    expect(monthRange(at("2026-10-31T23:59:59+04:00"), TZ).start).toEqual(
      at("2026-10-01T00:00:00+04:00"),
    );
  });
});

describe("resolvePeriod", () => {
  it("'all' is the challenge window", () => {
    const range = resolvePeriod("all", at("2026-11-01T12:00:00Z"), campaign);
    expect(range).toEqual({
      start: campaign.startsAt,
      end: campaign.endsAt,
      isCurrent: true,
    });
  });

  it("intersects the first week and month with the challenge start", () => {
    // The challenge starts on a Tuesday (Oct 6) mid-month.
    const now = at("2026-10-08T12:00:00+04:00");
    expect(resolvePeriod("week", now, campaign)).toEqual({
      start: campaign.startsAt,
      end: at("2026-10-12T00:00:00+04:00"),
      isCurrent: true,
    });
    expect(resolvePeriod("month", now, campaign).start).toEqual(
      campaign.startsAt,
    );
  });

  it("intersects the last month with the challenge end", () => {
    const range = resolvePeriod(
      "month",
      at("2027-01-03T12:00:00+04:00"),
      campaign,
    );
    expect(range.start).toEqual(at("2027-01-01T00:00:00+04:00"));
    expect(range.end).toEqual(campaign.endsAt);
  });

  it("shows the first period before the challenge starts", () => {
    const range = resolvePeriod(
      "week",
      at("2026-10-01T12:00:00+04:00"),
      campaign,
    );
    expect(range.start).toEqual(campaign.startsAt);
    expect(range.isCurrent).toBe(false);
  });

  it("shows the last period after the challenge ends", () => {
    const range = resolvePeriod(
      "month",
      at("2027-02-15T12:00:00+04:00"),
      campaign,
    );
    expect(range.start).toEqual(at("2027-01-01T00:00:00+04:00"));
    expect(range.end).toEqual(campaign.endsAt);
    expect(range.isCurrent).toBe(false);
  });

  it("treats the challenge end as exclusive", () => {
    expect(resolvePeriod("all", campaign.endsAt, campaign).isCurrent).toBe(
      false,
    );
    const window = { start: campaign.startsAt, end: campaign.endsAt };
    expect(isWithin(campaign.endsAt, window)).toBe(false);
    expect(isWithin(campaign.startsAt, window)).toBe(true);
  });

  it("never counts posts with an unknown publish date", () => {
    expect(
      isWithin(null, { start: campaign.startsAt, end: campaign.endsAt }),
    ).toBe(false);
  });
});

describe("grace periods", () => {
  it("accepts submissions until the end plus the grace days", () => {
    expect(submissionsOpen(at("2027-01-08T23:59:59+04:00"), campaign, 3)).toBe(
      true,
    );
    expect(submissionsOpen(at("2027-01-09T00:00:00+04:00"), campaign, 3)).toBe(
      false,
    );
  });

  it("refreshes metrics until the end plus the grace days", () => {
    expect(
      metricsRefreshOpen(at("2027-01-07T00:00:00+04:00"), campaign, 3),
    ).toBe(true);
    expect(
      metricsRefreshOpen(at("2027-01-10T00:00:00+04:00"), campaign, 3),
    ).toBe(false);
  });
});
