import type { LucideIcon } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
} from "@/components/icons/brand-icons";

/**
 * Supported platforms, kept in one place. To add or remove a platform, edit
 * PLATFORM_IDS and PLATFORMS below. The `Platform` type, filter chips, URL
 * detection and validation all derive from this file.
 */
export const PLATFORM_IDS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
] as const;

export type Platform = (typeof PLATFORM_IDS)[number];

/** What kind of post a link points to. The category decides the board and the score formula. */
export const CONTENT_TYPES = [
  "tiktok_video",
  "instagram_reel",
  "facebook_video",
  "instagram_photo",
  "facebook_post",
  "linkedin_post",
  "tiktok_photo",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_CATEGORIES = ["video", "static"] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_TYPE_INFO: Record<
  ContentType,
  { platform: Platform; category: ContentCategory }
> = {
  tiktok_video: { platform: "tiktok", category: "video" },
  instagram_reel: { platform: "instagram", category: "video" },
  facebook_video: { platform: "facebook", category: "video" },
  instagram_photo: { platform: "instagram", category: "static" },
  facebook_post: { platform: "facebook", category: "static" },
  linkedin_post: { platform: "linkedin", category: "static" },
  tiktok_photo: { platform: "tiktok", category: "video" },
};

/** Platforms that can appear on each board, in display order. */
export const CATEGORY_PLATFORMS: Record<ContentCategory, readonly Platform[]> =
  {
    video: ["tiktok", "instagram", "facebook"],
    static: ["linkedin", "facebook", "instagram"],
  };

/**
 * If the data provider reports that a "static" link is really a video, the
 * post moves to the video board. LinkedIn always stays static.
 */
export const VIDEO_RECLASSIFICATION: Partial<Record<ContentType, ContentType>> =
  {
    instagram_photo: "instagram_reel",
    facebook_post: "facebook_video",
  };

export function categoryOf(contentType: ContentType): ContentCategory {
  return CONTENT_TYPE_INFO[contentType].category;
}

export function isContentType(value: unknown): value is ContentType {
  return (
    typeof value === "string" &&
    (CONTENT_TYPES as readonly string[]).includes(value)
  );
}

export function isContentCategory(value: unknown): value is ContentCategory {
  return value === "video" || value === "static";
}

interface PostPattern {
  contentType: ContentType;
  /** Matched against `${host}${path}`: host without "www."/"m.", decoded path without a trailing slash. */
  match: RegExp;
  /** Query params that identify the post (kept in this order); every one must be present. */
  params?: readonly string[];
  /** The post's ID on the platform, used to catch duplicates across link variants. */
  externalId?: (
    match: RegExpMatchArray,
    params: URLSearchParams,
  ) => string | null;
  /** Rewrites the path to one canonical form (e.g. /reels/X → /reel/X). */
  canonicalPath?: (match: RegExpMatchArray) => string;
  /** A short link whose target the server resolves before checking duplicates. */
  shortLink?: boolean;
}

export interface PlatformDefinition {
  id: Platform;
  /** Brand name. Not translated. */
  name: string;
  icon: LucideIcon;
  /** CSS background for the icon badge: a brand color or gradient. */
  badge: string;
  /** Solid brand color for tinted thumbnails and accents. */
  color: string;
  /** Hostnames this platform serves, without a leading "www." or "m.". */
  hosts: readonly string[];
  /** Accepted post links. The first match wins. */
  posts: readonly PostPattern[];
  /** Links to content that exists but doesn't count: stories, profiles, feeds. */
  unsupported: readonly RegExp[];
}

const group = (index: number) => (match: RegExpMatchArray) =>
  match[index] ?? null;
const param =
  (name: string) => (_: RegExpMatchArray, params: URLSearchParams) =>
    params.get(name);

/** LinkedIn URNs: "ugcpost" → "ugcPost", so both spellings dedupe. */
const linkedInType = (type: string) =>
  type.toLowerCase() === "ugcpost" ? "ugcPost" : type.toLowerCase();

export const PLATFORMS: Record<Platform, PlatformDefinition> = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    icon: InstagramIcon,
    badge: "linear-gradient(45deg, #f9a03f 0%, #e1306c 45%, #8a3ab9 100%)",
    color: "#e1306c",
    hosts: ["instagram.com"],
    posts: [
      {
        contentType: "instagram_reel",
        match: /^instagram\.com\/(?:[\w.]+\/)?(?:reels?|tv)\/([\w-]+)$/i,
        externalId: group(1),
        canonicalPath: (m) => `/reel/${m[1]}`,
      },
      {
        contentType: "instagram_photo",
        match: /^instagram\.com\/(?:[\w.]+\/)?p\/([\w-]+)$/i,
        externalId: group(1),
        canonicalPath: (m) => `/p/${m[1]}`,
      },
    ],
    unsupported: [
      /^instagram\.com\/stories\/.+$/i,
      /^instagram\.com(?:\/(?:explore(?:\/.*)?|reels|stories))?$/i,
      /^instagram\.com\/[\w.]+$/i,
    ],
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    icon: FacebookIcon,
    badge: "#1877f2",
    color: "#1877f2",
    hosts: ["facebook.com", "fb.watch"],
    posts: [
      {
        contentType: "facebook_video",
        match: /^facebook\.com\/reel\/(\d+)$/i,
        externalId: group(1),
      },
      {
        contentType: "facebook_video",
        match: /^facebook\.com\/watch$/i,
        params: ["v"],
        externalId: param("v"),
      },
      {
        contentType: "facebook_video",
        match: /^facebook\.com\/[^/]+\/videos\/(?:[^/]+\/)?(\d+)$/i,
        externalId: group(1),
      },
      {
        contentType: "facebook_video",
        match: /^facebook\.com\/share\/[vr]\/[\w-]+$/i,
        shortLink: true,
      },
      {
        contentType: "facebook_video",
        match: /^fb\.watch\/[\w-]+$/i,
        shortLink: true,
      },
      {
        contentType: "facebook_post",
        match: /^facebook\.com\/[^/]+\/posts\/((?:pfbid)?\w+)$/i,
        externalId: group(1),
      },
      {
        contentType: "facebook_post",
        match: /^facebook\.com\/(?:permalink|story)\.php$/i,
        params: ["story_fbid", "id"],
        externalId: param("story_fbid"),
      },
      {
        contentType: "facebook_post",
        match: /^facebook\.com\/photo(?:\.php)?$/i,
        params: ["fbid"],
        externalId: param("fbid"),
      },
      {
        contentType: "facebook_post",
        match: /^facebook\.com\/[^/]+\/photos\/(?:[^/]+\/)*?(\d+)$/i,
        externalId: group(1),
      },
      {
        contentType: "facebook_post",
        match: /^facebook\.com\/share\/p\/[\w-]+$/i,
        shortLink: true,
      },
    ],
    unsupported: [
      /^facebook\.com\/stories\/.+$/i,
      /^facebook\.com(?:\/watch)?$/i,
      /^facebook\.com\/(?!(?:photo|photo\.php|permalink\.php|story\.php|reel|share)$)[\w.-]+$/i,
    ],
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    icon: TikTokIcon,
    badge: "linear-gradient(135deg, #111111 0%, #000000 100%)",
    color: "#25f4ee",
    hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    posts: [
      {
        contentType: "tiktok_video",
        match: /^tiktok\.com\/@[\w.-]+\/video\/(\d+)$/i,
        externalId: group(1),
      },
      {
        contentType: "tiktok_photo",
        match: /^tiktok\.com\/@[\w.-]+\/photo\/(\d+)$/i,
        externalId: group(1),
      },
      {
        contentType: "tiktok_video",
        match: /^v[mt]\.tiktok\.com\/[\w-]+$/i,
        shortLink: true,
      },
      {
        contentType: "tiktok_video",
        match: /^tiktok\.com\/t\/[\w-]+$/i,
        shortLink: true,
      },
    ],
    unsupported: [
      /^tiktok\.com\/@[\w.-]+(?:\/live)?$/i,
      /^tiktok\.com(?:\/(?:foryou|following|friends|explore|discover(?:\/.*)?))?$/i,
    ],
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    icon: LinkedInIcon,
    badge: "#0a66c2",
    color: "#0a66c2",
    hosts: ["linkedin.com"],
    posts: [
      {
        contentType: "linkedin_post",
        match: /^linkedin\.com\/posts\/([^/]+)$/i,
        // Slugs end in "-activity-7212345678901234567-AbCd" (or ugcPost/share).
        externalId: (m) => {
          const ids = [
            ...(m[1] ?? "").matchAll(/(activity|ugcPost|share)-(\d{15,20})/gi),
          ];
          const last = ids.at(-1);
          return last ? `${linkedInType(last[1]!)}:${last[2]}` : null;
        },
      },
      {
        contentType: "linkedin_post",
        match:
          /^linkedin\.com\/feed\/update\/urn:li:(activity|ugcPost|share):(\d+)$/i,
        externalId: (m) => `${linkedInType(m[1]!)}:${m[2]}`,
        canonicalPath: (m) =>
          `/feed/update/urn:li:${linkedInType(m[1]!)}:${m[2]}`,
      },
    ],
    unsupported: [
      /^linkedin\.com\/in\/[^/]+$/i,
      /^linkedin\.com\/company\/.+$/i,
      /^linkedin\.com(?:\/feed)?$/i,
    ],
  },
};

export const PLATFORM_LIST: readonly PlatformDefinition[] = PLATFORM_IDS.map(
  (id) => PLATFORMS[id],
);

export function isPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" &&
    (PLATFORM_IDS as readonly string[]).includes(value)
  );
}

export type PostUrlAnalysis =
  | { status: "empty" }
  | { status: "invalid-url" }
  | { status: "unsupported-platform" }
  /** On a supported platform, but not a link to a post. */
  | { status: "not-a-post"; platform: Platform }
  /** A story, profile or feed: real content that doesn't count. */
  | { status: "unsupported-content"; platform: Platform }
  | {
      status: "valid";
      platform: Platform;
      contentType: ContentType;
      category: ContentCategory;
      normalizedUrl: string;
      /** The platform's post ID when the URL contains it; null for short links. */
      externalId: string | null;
      /** A short link the server must resolve to find the real post. */
      needsResolution: boolean;
    };

interface CleanedUrl {
  host: string;
  /** Decoded pathname without a trailing slash, e.g. "/reel/abc". */
  path: string;
  params: URLSearchParams;
  platform: Platform | null;
}

const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

function stripSubdomain(hostname: string): string {
  return hostname.replace(/^(?:www|m)\./, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function platformForHost(host: string): Platform | null {
  return PLATFORM_LIST.find((p) => p.hosts.includes(host))?.id ?? null;
}

function cleanUrl(input: string): CleanedUrl | null {
  const raw = input.trim();
  const withScheme = SCHEME.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, "")}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;

  const host = stripSubdomain(url.hostname.toLowerCase());
  return {
    host,
    path: safeDecode(url.pathname).replace(/\/+$/, ""),
    params: url.searchParams,
    platform: platformForHost(host),
  };
}

/**
 * Returns the platform a link belongs to, based on its host only. Use this
 * for live feedback while the user is still typing the path.
 */
export function detectPlatform(input: string): Platform | null {
  if (!input.trim()) return null;
  return cleanUrl(input)?.platform ?? null;
}

/**
 * Classifies a link. For an accepted post link it returns the content type,
 * category, the post's external ID when the URL contains it, and a normalized
 * URL: https, no "www."/"m.", no trailing slash, canonical path, and only the
 * query params that identify the post (tracking params are dropped). Two
 * links to the same post normalize to the same string.
 */
export function analyzePostUrl(input: string): PostUrlAnalysis {
  if (!input.trim()) return { status: "empty" };

  const cleaned = cleanUrl(input);
  if (!cleaned) return { status: "invalid-url" };
  const { host, path, params, platform } = cleaned;
  if (!platform) return { status: "unsupported-platform" };

  const definition = PLATFORMS[platform];
  const candidate = `${host}${path}`;
  for (const pattern of definition.posts) {
    const match = candidate.match(pattern.match);
    if (!match) continue;
    const required = pattern.params ?? [];
    const kept = new URLSearchParams();
    for (const name of required) {
      const value = params.get(name);
      if (value) kept.set(name, value);
    }
    if (required.some((name) => !kept.has(name))) continue;

    const query = kept.toString();
    const canonicalPath = pattern.canonicalPath?.(match) ?? path;
    return {
      status: "valid",
      platform,
      contentType: pattern.contentType,
      category: categoryOf(pattern.contentType),
      normalizedUrl: `https://${host}${encodeURI(canonicalPath)}${query ? `?${query}` : ""}`,
      externalId: pattern.externalId?.(match, params) ?? null,
      needsResolution: pattern.shortLink === true,
    };
  }

  if (definition.unsupported.some((pattern) => pattern.test(candidate))) {
    return { status: "unsupported-content", platform };
  }
  return { status: "not-a-post", platform };
}

/** Returns the URL only if it's a safe http(s) link to render as an href. */
export function safeExternalUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
