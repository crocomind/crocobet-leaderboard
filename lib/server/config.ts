import "server-only";
import { z } from "zod";
import {
  type CampaignTagConfig,
  parseCampaignHashtags,
  parseCampaignMentions,
} from "@/lib/campaign-tag";
import type { CampaignWindow } from "@/lib/periods";
import { type Platform, PLATFORM_IDS } from "@/lib/platforms";

/**
 * Server configuration, validated once. Secrets (DATABASE_URL, CRON_SECRET,
 * provider tokens) are server-only and never NEXT_PUBLIC_. Missing optional
 * values fall back to safe defaults; invalid ones fail loudly.
 */

/** Placeholder challenge window until the real dates are set (§11). */
export const DEFAULT_CHALLENGE_STARTS_AT = "2026-10-06T00:00:00+04:00";
export const DEFAULT_CHALLENGE_ENDS_AT = "2027-01-06T00:00:00+04:00";

/** Admins when ADMIN_EMAILS isn't set. ADMIN_EMAILS replaces this list. */
export const DEFAULT_ADMIN_EMAILS = [
  "tekizashvili@crocobet.com",
  "gbedoshvili@crocobet.com",
];

export interface ServerConfig {
  databaseUrl: string | null;
  cronSecret: string | null;
  /** Data provider id per platform ("fixture", "manual" or a third-party id). */
  providers: Record<Platform, string>;
  /** Lowercase. */
  adminEmails: string[];
  campaign: CampaignWindow;
  tags: CampaignTagConfig;
  submissionGraceDays: number;
  metricsGraceDays: number;
  growthFlag: { factor: number; min: number };
}

const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const instant = (fallback: string) =>
  optional
    .refine((value) => value === undefined || ISO_WITH_OFFSET.test(value), {
      message:
        "must be an ISO date-time with an offset, e.g. 2026-10-06T00:00:00+04:00",
    })
    .transform((value) => new Date(value ?? fallback));

const count = (fallback: number) =>
  optional
    .refine((value) => value === undefined || /^\d+$/.test(value), {
      message: "must be a whole number",
    })
    .transform((value) => (value === undefined ? fallback : Number(value)));

const positive = (fallback: number) =>
  optional
    .refine(
      (value) =>
        value === undefined ||
        (Number.isFinite(Number(value)) && Number(value) > 0),
      { message: "must be a positive number" },
    )
    .transform((value) => (value === undefined ? fallback : Number(value)));

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const providerId = optional.refine(
  (value) => value === undefined || /^[a-z][a-z0-9_-]*$/.test(value),
  { message: "must be a provider id such as fixture, manual or apify" },
);

const schema = z.object({
  DATABASE_URL: optional.refine(
    (value) => value === undefined || /^postgres(ql)?:\/\//.test(value),
    { message: "must be a postgres:// connection string" },
  ),
  CRON_SECRET: optional.refine(
    (value) => value === undefined || value.length >= 16,
    { message: "must be at least 16 characters" },
  ),
  POST_DATA_PROVIDER: providerId,
  POST_DATA_PROVIDER_INSTAGRAM: providerId,
  POST_DATA_PROVIDER_FACEBOOK: providerId,
  POST_DATA_PROVIDER_TIKTOK: providerId,
  POST_DATA_PROVIDER_LINKEDIN: providerId,
  ADMIN_EMAILS: optional,
  CHALLENGE_STARTS_AT: instant(DEFAULT_CHALLENGE_STARTS_AT),
  CHALLENGE_ENDS_AT: instant(DEFAULT_CHALLENGE_ENDS_AT),
  CAMPAIGN_TIMEZONE: optional.refine(
    (value) => value === undefined || isTimeZone(value),
    { message: "must be an IANA time zone such as Asia/Tbilisi" },
  ),
  CAMPAIGN_HASHTAGS: optional,
  CAMPAIGN_MENTIONS: optional,
  SUBMISSION_GRACE_DAYS: count(3),
  METRICS_GRACE_DAYS: count(3),
  GROWTH_FLAG_FACTOR: positive(5),
  GROWTH_FLAG_MIN: count(1000),
  VERCEL_ENV: optional,
});

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid server configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
  }
}

export function parseServerConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new ConfigError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      ),
    );
  const value = parsed.data;
  if (value.CHALLENGE_ENDS_AT <= value.CHALLENGE_STARTS_AT)
    throw new ConfigError([
      "CHALLENGE_ENDS_AT must be after CHALLENGE_STARTS_AT",
    ]);

  // Fake fixture data must never reach production by accident.
  const fallbackProvider =
    value.POST_DATA_PROVIDER ??
    (value.VERCEL_ENV === "production" ? "manual" : "fixture");
  const perPlatform: Record<Platform, string | undefined> = {
    instagram: value.POST_DATA_PROVIDER_INSTAGRAM,
    facebook: value.POST_DATA_PROVIDER_FACEBOOK,
    tiktok: value.POST_DATA_PROVIDER_TIKTOK,
    linkedin: value.POST_DATA_PROVIDER_LINKEDIN,
  };

  return {
    databaseUrl: value.DATABASE_URL ?? null,
    cronSecret: value.CRON_SECRET ?? null,
    providers: Object.fromEntries(
      PLATFORM_IDS.map((platform) => [
        platform,
        perPlatform[platform] ?? fallbackProvider,
      ]),
    ) as Record<Platform, string>,
    adminEmails: value.ADMIN_EMAILS
      ? value.ADMIN_EMAILS.split(",")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.includes("@"))
      : DEFAULT_ADMIN_EMAILS,
    campaign: {
      startsAt: value.CHALLENGE_STARTS_AT,
      endsAt: value.CHALLENGE_ENDS_AT,
      timeZone: value.CAMPAIGN_TIMEZONE ?? "Asia/Tbilisi",
    },
    tags: {
      hashtags: parseCampaignHashtags(value.CAMPAIGN_HASHTAGS),
      mentions: parseCampaignMentions(value.CAMPAIGN_MENTIONS),
    },
    submissionGraceDays: value.SUBMISSION_GRACE_DAYS,
    metricsGraceDays: value.METRICS_GRACE_DAYS,
    growthFlag: {
      factor: value.GROWTH_FLAG_FACTOR,
      min: value.GROWTH_FLAG_MIN,
    },
  };
}

let cached: ServerConfig | undefined;

/** The validated configuration from process.env (parsed on first use). */
export function getServerConfig(): ServerConfig {
  cached ??= parseServerConfig(process.env);
  return cached;
}
