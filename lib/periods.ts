/**
 * Campaign periods. Everything is computed in the campaign's time zone
 * (Asia/Tbilisi by default), never in the server's local time: Vercel runs in
 * UTC. Ranges are half-open: [start, end).
 */

export const PERIODS = ["week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

export interface CampaignWindow {
  /** First instant of the 3-month challenge. */
  startsAt: Date;
  /** First instant after the challenge (exclusive end). */
  endsAt: Date;
  timeZone: string;
}

export interface PeriodRange {
  start: Date;
  end: Date;
  /** True if "now" falls inside this range. */
  isCurrent: boolean;
}

const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = Monday … 7 = Sunday (ISO). */
  isoWeekday: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The wall-clock date and time of an instant in a time zone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    isoWeekday: WEEKDAYS.indexOf(get("weekday")) + 1,
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which a wall-clock time occurs in a time zone. Handles DST shifts. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(new Date(guess), timeZone);
  const candidate = guess - first;
  const second = offsetMs(new Date(candidate), timeZone);
  return new Date(second === first ? candidate : guess - second);
}

function localMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  // Date.UTC normalizes overflow (e.g. day 32 → next month).
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return zonedTimeToUtc(
    normalized.getUTCFullYear(),
    normalized.getUTCMonth() + 1,
    normalized.getUTCDate(),
    0,
    0,
    timeZone,
  );
}

/** ISO week (Monday 00:00 to the next Monday 00:00) containing the instant. */
export function weekRange(
  instant: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const p = zonedParts(instant, timeZone);
  const mondayDay = p.day - (p.isoWeekday - 1);
  return {
    start: localMidnight(p.year, p.month, mondayDay, timeZone),
    end: localMidnight(p.year, p.month, mondayDay + 7, timeZone),
  };
}

/** Calendar month (the 1st 00:00 to the next 1st 00:00) containing the instant. */
export function monthRange(
  instant: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const p = zonedParts(instant, timeZone);
  return {
    start: localMidnight(p.year, p.month, 1, timeZone),
    end: localMidnight(p.year, p.month + 1, 1, timeZone),
  };
}

/**
 * The dates a board covers. Week and month are intersected with the challenge
 * window. Before the challenge starts they show its first period; after it
 * ends, its last one.
 */
export function resolvePeriod(
  period: Period,
  now: Date,
  campaign: CampaignWindow,
): PeriodRange {
  const { startsAt, endsAt, timeZone } = campaign;
  let start: Date;
  let end: Date;

  if (period === "all") {
    start = startsAt;
    end = endsAt;
  } else {
    const time = Math.min(
      Math.max(now.getTime(), startsAt.getTime()),
      endsAt.getTime() - 1,
    );
    const reference = new Date(time);
    const range =
      period === "week"
        ? weekRange(reference, timeZone)
        : monthRange(reference, timeZone);
    start = new Date(Math.max(range.start.getTime(), startsAt.getTime()));
    end = new Date(Math.min(range.end.getTime(), endsAt.getTime()));
  }

  return { start, end, isCurrent: now >= start && now < end };
}

export function isWithin(
  instant: Date | null,
  range: { start: Date; end: Date },
): boolean {
  return instant !== null && instant >= range.start && instant < range.end;
}

/** Submissions are accepted until the challenge ends plus a grace period. */
export function submissionsOpen(
  now: Date,
  campaign: CampaignWindow,
  graceDays: number,
): boolean {
  return now.getTime() < campaign.endsAt.getTime() + graceDays * DAY_MS;
}

/** Metrics keep refreshing until the challenge ends plus a grace period; after that they're final. */
export function metricsRefreshOpen(
  now: Date,
  campaign: CampaignWindow,
  graceDays: number,
): boolean {
  return now.getTime() < campaign.endsAt.getTime() + graceDays * DAY_MS;
}

/** A submitter's "posted on" date (YYYY-MM-DD), read as 12:00 in the campaign time zone. */
export function postedDateToInstant(
  date: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return zonedTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    12,
    0,
    timeZone,
  );
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function zonedToday(now: Date, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
