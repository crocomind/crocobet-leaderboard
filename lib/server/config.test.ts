import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULT_CHALLENGE_ENDS_AT,
  DEFAULT_CHALLENGE_STARTS_AT,
  parseServerConfig,
} from "@/lib/server/config";

describe("parseServerConfig", () => {
  it("falls back to safe defaults", () => {
    const config = parseServerConfig({});
    expect(config).toMatchObject({
      databaseUrl: null,
      cronSecret: null,
      adminEmails: [],
      submissionGraceDays: 3,
      metricsGraceDays: 3,
      growthFlag: { factor: 5, min: 1000 },
      tags: { hashtags: ["CrocoBySquad"], mentions: {} },
    });
    expect(config.campaign).toEqual({
      startsAt: new Date(DEFAULT_CHALLENGE_STARTS_AT),
      endsAt: new Date(DEFAULT_CHALLENGE_ENDS_AT),
      timeZone: "Asia/Tbilisi",
    });
    expect(config.providers).toEqual({
      instagram: "fixture",
      facebook: "fixture",
      tiktok: "fixture",
      linkedin: "fixture",
    });
  });

  it("never defaults to fixture data in production", () => {
    expect(
      parseServerConfig({ VERCEL_ENV: "production" }).providers.tiktok,
    ).toBe("manual");
  });

  it("reads every variable, with per-platform provider overrides", () => {
    const config = parseServerConfig({
      DATABASE_URL: "postgresql://user:pass@host:6543/postgres",
      CRON_SECRET: "a-very-long-cron-secret",
      POST_DATA_PROVIDER: "apify",
      POST_DATA_PROVIDER_LINKEDIN: "manual",
      ADMIN_EMAILS: " Ana@Crocobet.com, nino@crocobet.com ,, nope ",
      CHALLENGE_STARTS_AT: "2026-11-01T00:00:00+04:00",
      CHALLENGE_ENDS_AT: "2027-02-01T00:00:00+04:00",
      CAMPAIGN_TIMEZONE: "Europe/London",
      CAMPAIGN_HASHTAGS: "#CrocoBySquad, Extra",
      CAMPAIGN_MENTIONS: "instagram:crocosquad,facebook:Croco Squad",
      SUBMISSION_GRACE_DAYS: "5",
      METRICS_GRACE_DAYS: "0",
      GROWTH_FLAG_FACTOR: "3.5",
      GROWTH_FLAG_MIN: "500",
    });
    expect(config).toMatchObject({
      databaseUrl: "postgresql://user:pass@host:6543/postgres",
      cronSecret: "a-very-long-cron-secret",
      providers: {
        instagram: "apify",
        facebook: "apify",
        tiktok: "apify",
        linkedin: "manual",
      },
      adminEmails: ["ana@crocobet.com", "nino@crocobet.com"],
      tags: {
        hashtags: ["CrocoBySquad", "Extra"],
        mentions: { instagram: ["crocosquad"], facebook: ["Croco Squad"] },
      },
      submissionGraceDays: 5,
      metricsGraceDays: 0,
      growthFlag: { factor: 3.5, min: 500 },
    });
    expect(config.campaign.timeZone).toBe("Europe/London");
    expect(config.campaign.startsAt.toISOString()).toBe(
      "2026-10-31T20:00:00.000Z",
    );
  });

  it("rejects invalid values with a clear message", () => {
    const issues = (env: Record<string, string>) => {
      try {
        parseServerConfig(env);
      } catch (error) {
        if (error instanceof ConfigError) return error.issues.join(" | ");
        throw error;
      }
      return "";
    };
    expect(issues({ CHALLENGE_STARTS_AT: "2026-10-06" })).toContain(
      "CHALLENGE_STARTS_AT must be an ISO date-time with an offset",
    );
    expect(issues({ CAMPAIGN_TIMEZONE: "Mars/Olympus" })).toContain(
      "CAMPAIGN_TIMEZONE",
    );
    expect(issues({ CRON_SECRET: "short" })).toContain("CRON_SECRET");
    expect(issues({ DATABASE_URL: "mysql://x" })).toContain("DATABASE_URL");
    expect(issues({ GROWTH_FLAG_MIN: "-1" })).toContain("GROWTH_FLAG_MIN");
    expect(
      issues({
        CHALLENGE_STARTS_AT: "2027-01-01T00:00:00Z",
        CHALLENGE_ENDS_AT: "2026-12-01T00:00:00Z",
      }),
    ).toContain("must be after");
  });
});
