import { zonedParts } from "@/lib/periods";

export interface PluralForms {
  one: string;
  other: string;
}

/** Replaces {key} placeholders. Unknown keys are left as-is. */
export function interpolate(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

type RelativeUnit = "minute" | "hour" | "day";

interface BaseFormatters {
  number: (value: number) => string;
  compact: (value: number) => string;
  date: (date: Date) => string;
  /** A calendar day (already in the right time zone), e.g. "29 Sept" or "29 Sept 2026". */
  day: (year: number, month: number, day: number, withYear: boolean) => string;
  /** Local date and time, e.g. "5 Oct, 08:00". */
  dateTime: (date: Date, withYear: boolean) => string;
  /** A month's full name, e.g. "October". */
  month: (month: number) => string;
  relative: (value: number, unit: RelativeUnit) => string;
  list: (items: readonly string[], type: "and" | "or") => string;
  plural: (count: number) => "one" | "other";
}

/** Numbers use en-US ("12.6K"; en-GB's "k" differs across ICU versions); dates use day-first en-GB. */
function englishFormatters(): BaseFormatters {
  const tag = "en-US";
  const number = new Intl.NumberFormat(tag);
  const compact = new Intl.NumberFormat(tag, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const dayWithYear = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateTime = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const dateTimeWithYear = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const monthName = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const and = new Intl.ListFormat(tag, { type: "conjunction" });
  const or = new Intl.ListFormat(tag, { type: "disjunction" });
  const plurals = new Intl.PluralRules(tag);

  return {
    number: (value) => number.format(value),
    compact: (value) => compact.format(value),
    date: (value) => date.format(value),
    day: (y, m, d, withYear) =>
      (withYear ? dayWithYear : day).format(Date.UTC(y, m - 1, d, 12)),
    dateTime: (value, withYear) =>
      (withYear ? dateTimeWithYear : dateTime).format(value),
    month: (month) => monthName.format(Date.UTC(2026, month - 1, 15)),
    relative: (value, unit) => relative.format(value, unit),
    list: (items, type) => (type === "and" ? and : or).format(items),
    plural: (count) => (plurals.select(count) === "one" ? "one" : "other"),
  };
}

const formatters = englishFormatters();

export function createFormatters() {
  const f = formatters;

  return {
    formatNumber: f.number,
    /** 12,400 -> "12.4K". Full numbers below 10,000 so small gaps stay exact. */
    formatCompact: (value: number) =>
      Math.abs(value) < 10_000 ? f.number(value) : f.compact(value),
    /** Accepts "2026-09-28" or a full ISO timestamp. */
    formatDate: (value: string) =>
      f.date(new Date(value.length === 10 ? `${value}T12:00:00` : value)),
    /**
     * A board's dates in the campaign time zone, e.g. "29 Sept – 5 Oct". The
     * end is exclusive. Years appear only when the range spans two.
     */
    formatDateRange: (start: string, end: string, timeZone: string) => {
      const from = zonedParts(new Date(start), timeZone);
      const to = zonedParts(new Date(Date.parse(end) - 1), timeZone);
      const withYear = from.year !== to.year;
      const first = f.day(from.year, from.month, from.day, withYear);
      const last = f.day(to.year, to.month, to.day, withYear);
      return first === last ? first : `${first} – ${last}`;
    },
    /** The month an instant falls in, in a time zone, e.g. "October". */
    formatMonth: (value: string, timeZone: string) =>
      f.month(zonedParts(new Date(value), timeZone).month),
    /** Local date and time; the year only when it isn't this year. */
    formatDateTime: (value: string) => {
      const date = new Date(value);
      return f.dateTime(date, date.getFullYear() !== new Date().getFullYear());
    },
    /** Relative to `now`; returns null under a minute so callers can say "just now". */
    formatRelativeTime: (value: string, now: number): string | null => {
      const seconds = Math.round((Date.parse(value) - now) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 60) return null;
      if (abs < 3600) return f.relative(Math.round(seconds / 60), "minute");
      if (abs < 86_400) return f.relative(Math.round(seconds / 3600), "hour");
      return f.relative(Math.round(seconds / 86_400), "day");
    },
    /** Picks the plural form for `count` and fills {count} with the formatted number. */
    plural: (
      forms: PluralForms,
      count: number,
      format: (value: number) => string = f.number,
    ) => interpolate(forms[f.plural(count)], { count: format(count) }),
    formatList: (items: readonly string[], type: "and" | "or" = "and") =>
      f.list(items, type),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
