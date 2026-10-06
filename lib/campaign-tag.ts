import { isPlatform, type Platform } from "@/lib/platforms";

/**
 * The campaign rule: a post needs the campaign hashtag (#CrocoBySquad) and a
 * tag of the Croco Squad account on its platform. The result is evidence for
 * the admin who approves posts; nothing is approved automatically.
 */

export const DEFAULT_HASHTAGS = ["CrocoBySquad"];

/**
 * The Croco Squad accounts as they appear when tagged: a handle on Instagram,
 * the account or page name elsewhere. CAMPAIGN_MENTIONS replaces these.
 */
export const DEFAULT_MENTIONS: Record<Platform, readonly string[]> = {
  instagram: ["croco.squad"],
  tiktok: ["Croco Squad"],
  facebook: ["Croco Squad"],
  linkedin: ["crocobet.com | Croco Squad"],
};

export interface CampaignTagConfig {
  /** Without "#". */
  hashtags: readonly string[];
  /** Handles ("croco.squad") or account names ("Croco Squad"), per platform. */
  mentions: Partial<Record<Platform, readonly string[]>>;
}

export interface TagEvidence {
  caption: string | null;
  /** The provider's structured hashtags (with or without "#"). */
  hashtags?: readonly string[];
  /** The provider's mentions, tagged users or collaborators (handles or names). */
  mentions?: readonly string[];
}

export interface TagCheckResult {
  /** The hashtag and, where an account is configured, its tag. */
  passed: boolean;
  /** What matched, normalized, e.g. ["#crocobysquad", "@croco.squad"]. */
  matched: string[];
}

/** Which halves of the rule a check's matches cover (hashtags start with "#"). */
export function tagParts(matched: readonly string[]) {
  return {
    hashtag: matched.some((token) => token.startsWith("#")),
    mention: matched.some((token) => !token.startsWith("#")),
  };
}

/** How to tag Croco Squad on a platform, e.g. "@croco.squad" or "@Croco Squad". */
export function squadTag(
  platform: Platform,
  mentions: CampaignTagConfig["mentions"] = DEFAULT_MENTIONS,
): string | null {
  const account = mentions[platform]?.[0]?.trim();
  return account ? `@${stripPrefix(account, "@")}` : null;
}

const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
const collapse = (value: string) =>
  normalize(value).replace(/\s+/g, " ").trim();
const stripPrefix = (value: string, prefix: string) =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

const HASHTAG = /#([\p{L}\p{M}\p{N}_]+)/gu;
const MENTION = /@([\p{L}\p{M}\p{N}_.]+)/gu;
/** A handle, as opposed to a name with spaces or punctuation. */
const HANDLE = /^[\p{L}\p{M}\p{N}_.]+$/u;

function captionHashtags(caption: string): string[] {
  return [...normalize(caption).matchAll(HASHTAG)].map((m) => m[1] ?? "");
}

function captionMentions(caption: string): string[] {
  return [...normalize(caption).matchAll(MENTION)].map((m) =>
    (m[1] ?? "").replace(/\.+$/, ""),
  );
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-phrase match, e.g. "Croco Squad" in "Thanks Croco  Squad!" but not in "Croco Squadron". */
function containsPhrase(text: string, phrase: string): boolean {
  const words = collapse(phrase).split(" ").map(escapeRegExp).join("\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}_])${words}(?![\\p{L}\\p{M}\\p{N}_])`,
    "u",
  ).test(normalize(text));
}

export function checkCampaignTag(
  platform: Platform,
  evidence: TagEvidence,
  config: CampaignTagConfig,
): TagCheckResult {
  const matched = new Set<string>();
  const caption = evidence.caption ?? "";

  const wantedTags = config.hashtags.map((tag) =>
    normalize(stripPrefix(tag.trim(), "#")),
  );
  const foundTags = new Set([
    ...captionHashtags(caption),
    ...(evidence.hashtags ?? []).map((tag) =>
      normalize(stripPrefix(tag.trim(), "#")),
    ),
  ]);
  for (const tag of wantedTags) {
    if (tag && foundTags.has(tag)) matched.add(`#${tag}`);
  }

  const accounts = config.mentions[platform] ?? [];
  const foundHandles = new Set([
    ...captionMentions(caption),
    ...(evidence.mentions ?? []).map((handle) =>
      normalize(stripPrefix(handle.trim(), "@")),
    ),
  ]);
  const foundNames = new Set(
    (evidence.mentions ?? []).map((name) =>
      collapse(stripPrefix(name.trim(), "@")),
    ),
  );

  for (const account of accounts) {
    const handle = normalize(stripPrefix(account.trim(), "@"));
    if (!handle) continue;
    const isHandle = HANDLE.test(handle);
    if (isHandle && foundHandles.has(handle)) {
      matched.add(`@${handle}`);
      continue;
    }
    // Names ("Croco Squad") are matched as a phrase, on any platform; so are
    // handles on Facebook and LinkedIn, where pages are mentioned by name.
    if (!isHandle || platform === "facebook" || platform === "linkedin") {
      const name = collapse(account);
      if (foundNames.has(name) || containsPhrase(caption, account))
        matched.add(account.trim());
    }
  }

  const { hashtag, mention } = tagParts([...matched]);
  return {
    passed: hashtag && (accounts.length === 0 || mention),
    matched: [...matched],
  };
}

/**
 * "instagram:crocosquad,facebook:Croco Squad" → { instagram: ["crocosquad"],
 * facebook: ["Croco Squad"] }. Empty → DEFAULT_MENTIONS; "none" → hashtags only.
 */
export function parseCampaignMentions(
  value: string | undefined,
): CampaignTagConfig["mentions"] {
  if (!value?.trim()) return DEFAULT_MENTIONS;
  if (value.trim().toLowerCase() === "none") return {};
  const mentions: Partial<Record<Platform, string[]>> = {};
  for (const item of (value ?? "").split(",")) {
    const separator = item.indexOf(":");
    if (separator === -1) continue;
    const platform = item.slice(0, separator).trim().toLowerCase();
    const account = item.slice(separator + 1).trim();
    if (!isPlatform(platform) || !account) continue;
    (mentions[platform] ??= []).push(account);
  }
  return mentions;
}

/** "CrocoBySquad, #Other" → ["CrocoBySquad", "Other"]. Falls back to the default. */
export function parseCampaignHashtags(value: string | undefined): string[] {
  const tags = (value ?? "")
    .split(",")
    .map((tag) => stripPrefix(tag.trim(), "#"))
    .filter(Boolean);
  return tags.length > 0 ? tags : [...DEFAULT_HASHTAGS];
}
