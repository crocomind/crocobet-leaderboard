import { describe, expect, it } from "vitest";
import { createFormatters } from "@/lib/i18n/format";

const NBSP = " ";
const NOW = Date.parse("2026-10-01T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

describe("Georgian formatting", () => {
  const ka = createFormatters("ka");

  it("groups thousands with a space and uses a decimal comma", () => {
    expect(ka.formatNumber(36616)).toBe(`36${NBSP}616`);
    expect(ka.formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(ka.formatCompact(12_640)).toBe(`12,6${NBSP}ათ.`);
    expect(ka.formatCompact(2_000_000)).toBe(`2${NBSP}მლნ.`);
    expect(ka.formatCompact(9_548)).toBe(`9${NBSP}548`);
  });

  it("formats relative times, dates and lists in Georgian", () => {
    expect(ka.formatRelativeTime(minutesAgo(4), NOW)).toBe("4 წუთის წინ");
    expect(ka.formatRelativeTime(minutesAgo(180), NOW)).toBe("3 საათის წინ");
    expect(ka.formatRelativeTime(minutesAgo(24 * 60), NOW)).toBe("გუშინ");
    expect(ka.formatRelativeTime(minutesAgo(0.5), NOW)).toBeNull();
    expect(ka.formatDate("2026-09-27")).toBe("27 სექ. 2026");
    expect(ka.formatList(["Instagram", "TikTok", "LinkedIn"], "or")).toBe(
      "Instagram, TikTok ან LinkedIn",
    );
  });
});

describe("English formatting", () => {
  const en = createFormatters("en");

  it("uses Intl", () => {
    expect(en.formatNumber(36616)).toBe("36,616");
    expect(en.formatCompact(12_640)).toBe("12.6K");
    expect(en.formatRelativeTime(minutesAgo(4), NOW)).toBe("4 minutes ago");
    expect(en.plural({ one: "{count} view", other: "{count} views" }, 1)).toBe(
      "1 view",
    );
    expect(
      en.plural({ one: "{count} view", other: "{count} views" }, 2300),
    ).toBe("2,300 views");
  });
});
