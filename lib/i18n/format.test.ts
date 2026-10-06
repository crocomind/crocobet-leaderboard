import { describe, expect, it } from "vitest";
import { createFormatters } from "@/lib/i18n/format";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

describe("formatting", () => {
  const en = createFormatters();

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
    expect(
      en.formatDateRange(
        "2026-09-27T20:00:00Z",
        "2026-10-04T20:00:00Z",
        "Asia/Tbilisi",
      ),
    ).toMatch(/^28 Sept? – 4 Oct$/);
    // The year shows only when a range spans two.
    expect(
      en.formatDateRange(
        "2026-12-27T20:00:00Z",
        "2027-01-03T20:00:00Z",
        "Asia/Tbilisi",
      ),
    ).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(en.formatList(["Instagram", "TikTok", "LinkedIn"], "or")).toBe(
      "Instagram, TikTok, or LinkedIn",
    );
  });
});
