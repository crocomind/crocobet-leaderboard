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
  /**
   * A link is a valid video/post link if one of these matches
   * `${host}${path}${query}` of the cleaned URL, where host has "www."/"m."
   * removed, path is decoded with no trailing slash, and query contains only
   * `keepParams`.
   */
  patterns: readonly RegExp[];
  /** Query params that identify the video. All others (tracking) are dropped. */
  keepParams?: readonly string[];
}

export const PLATFORMS: Record<Platform, PlatformDefinition> = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    icon: InstagramIcon,
    badge: "linear-gradient(45deg, #f9a03f 0%, #e1306c 45%, #8a3ab9 100%)",
    color: "#e1306c",
    hosts: ["instagram.com"],
    patterns: [/^instagram\.com\/(?:reels?|p|tv)\/[\w-]+$/i],
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    icon: FacebookIcon,
    badge: "#1877f2",
    color: "#1877f2",
    hosts: ["facebook.com", "fb.watch"],
    keepParams: ["v"],
    patterns: [
      /^facebook\.com\/watch\?v=[\w-]+$/i,
      /^facebook\.com\/reel\/[\w-]+$/i,
      /^facebook\.com\/[^/?]+\/videos\/(?:[^/?]+\/)?\d+$/i,
      /^facebook\.com\/share\/[vr]\/[\w-]+$/i,
      /^fb\.watch\/[\w-]+$/i,
    ],
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    icon: TikTokIcon,
    badge: "linear-gradient(135deg, #111111 0%, #000000 100%)",
    color: "#25f4ee",
    hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    patterns: [
      /^tiktok\.com\/@[\w.-]+\/video\/\d+$/i,
      /^v[mt]\.tiktok\.com\/[\w-]+$/i,
      /^tiktok\.com\/t\/[\w-]+$/i,
    ],
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    icon: LinkedInIcon,
    badge: "#0a66c2",
    color: "#0a66c2",
    hosts: ["linkedin.com"],
    patterns: [
      /^linkedin\.com\/posts\/[^/?]+$/i,
      /^linkedin\.com\/feed\/update\/urn:li:(?:activity|ugcPost):\d+$/i,
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

export type VideoUrlAnalysis =
  | { status: "empty" }
  | { status: "invalid-url" }
  | { status: "unsupported-platform" }
  | { status: "not-a-video"; platform: Platform }
  | { status: "valid"; platform: Platform; normalizedUrl: string };

interface CleanedUrl {
  host: string;
  /** Decoded pathname without a trailing slash, e.g. "/reel/abc". */
  path: string;
  /** "?v=123" with only the platform's keepParams, or "". */
  query: string;
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
  const platform = platformForHost(host);
  const path = safeDecode(url.pathname).replace(/\/+$/, "");

  const kept = new URLSearchParams();
  const keepParams = platform ? (PLATFORMS[platform].keepParams ?? []) : [];
  for (const name of keepParams) {
    const value = url.searchParams.get(name);
    if (value) kept.set(name, value);
  }
  const keptQuery = kept.toString();
  const query = keptQuery ? `?${keptQuery}` : "";

  return { host, path, query, platform };
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
 * Classifies a link and, if it's a supported video/post link, returns a
 * normalized URL: https, no "www."/"m.", no trailing slash, no tracking
 * params. Two links to the same video normalize to the same string, which is
 * what duplicate detection compares.
 */
export function analyzeVideoUrl(input: string): VideoUrlAnalysis {
  if (!input.trim()) return { status: "empty" };

  const cleaned = cleanUrl(input);
  if (!cleaned) return { status: "invalid-url" };
  if (!cleaned.platform) return { status: "unsupported-platform" };

  const { host, path, query, platform } = cleaned;
  const candidate = `${host}${path}${query}`;
  const matches = PLATFORMS[platform].patterns.some((pattern) =>
    pattern.test(candidate),
  );
  if (!matches) return { status: "not-a-video", platform };

  return {
    status: "valid",
    platform,
    normalizedUrl: `https://${host}${encodeURI(path)}${query}`,
  };
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
