import type { Locale } from "./config";

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

interface LocaleFormatters {
  number: (value: number) => string;
  compact: (value: number) => string;
  date: (date: Date) => string;
  relative: (value: number, unit: RelativeUnit) => string;
  list: (items: readonly string[], type: "and" | "or") => string;
  plural: (count: number) => "one" | "other";
}

/** Numbers use en-US ("12.6K"; en-GB's "k" differs across ICU versions); dates use day-first en-GB. */
function englishFormatters(): LocaleFormatters {
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
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const and = new Intl.ListFormat(tag, { type: "conjunction" });
  const or = new Intl.ListFormat(tag, { type: "disjunction" });
  const plurals = new Intl.PluralRules(tag);

  return {
    number: (value) => number.format(value),
    compact: (value) => compact.format(value),
    date: (value) => date.format(value),
    relative: (value, unit) => relative.format(value, unit),
    list: (items, type) => (type === "and" ? and : or).format(items),
    plural: (count) => (plurals.select(count) === "one" ? "one" : "other"),
  };
}

/*
 * Georgian is formatted by hand (following CLDR) because Chrome ships without
 * Georgian Intl data and falls back to English ("2 minutes ago", "1,234"),
 * while Node has it. Doing it here keeps server and browser output identical.
 */
const NBSP = " ";
const KA_MONTHS = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];
const KA_RELATIVE: Record<RelativeUnit, { past: string; future: string }> = {
  minute: { past: "{n} წუთის წინ", future: "{n} წუთში" },
  hour: { past: "{n} საათის წინ", future: "{n} საათში" },
  day: { past: "{n} დღის წინ", future: "{n} დღეში" },
};

function georgianNumber(value: number, fractionDigits = 0): string {
  const [whole = "0", fraction = ""] = Math.abs(value)
    .toFixed(fractionDigits)
    .split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const trimmed = fraction.replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${grouped}${trimmed ? `,${trimmed}` : ""}`;
}

const georgianFormatters: LocaleFormatters = {
  number: (value) => georgianNumber(value),
  compact: (value) => {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${georgianNumber(value / 1e9, 1)}${NBSP}მლრდ.`;
    if (abs >= 1e6) return `${georgianNumber(value / 1e6, 1)}${NBSP}მლნ.`;
    if (abs >= 1e3) return `${georgianNumber(value / 1e3, 1)}${NBSP}ათ.`;
    return georgianNumber(value);
  },
  date: (value) =>
    `${value.getDate()} ${KA_MONTHS[value.getMonth()]}. ${value.getFullYear()}`,
  relative: (value, unit) => {
    if (unit === "day" && value === -1) return "გუშინ";
    if (unit === "day" && value === 1) return "ხვალ";
    const template =
      value < 0 ? KA_RELATIVE[unit].past : KA_RELATIVE[unit].future;
    return interpolate(template, { n: georgianNumber(Math.abs(value)) });
  },
  list: (items, type) => {
    if (items.length <= 1) return items.join("");
    const last = items[items.length - 1];
    return `${items.slice(0, -1).join(", ")} ${type === "and" ? "და" : "ან"} ${last}`;
  },
  // Georgian nouns stay singular after numbers, so both forms are the same.
  plural: (count) => (count === 1 ? "one" : "other"),
};

const cache = new Map<Locale, LocaleFormatters>();

function formattersFor(locale: Locale): LocaleFormatters {
  let formatters = cache.get(locale);
  if (!formatters) {
    formatters = locale === "ka" ? georgianFormatters : englishFormatters();
    cache.set(locale, formatters);
  }
  return formatters;
}

export function createFormatters(locale: Locale) {
  const f = formattersFor(locale);

  return {
    formatNumber: f.number,
    /** 12,400 -> "12.4K". Full numbers below 10,000 so small gaps stay exact. */
    formatCompact: (value: number) =>
      Math.abs(value) < 10_000 ? f.number(value) : f.compact(value),
    /** Accepts "2026-09-28" or a full ISO timestamp. */
    formatDate: (value: string) =>
      f.date(new Date(value.length === 10 ? `${value}T12:00:00` : value)),
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
