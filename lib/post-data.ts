import type { ContentType, Platform } from "@/lib/platforms";

/**
 * What a data provider is asked for and what it returns. Shared by the server
 * providers (lib/server/providers) and the mock API, which runs the same
 * fixture provider in the browser.
 */

export interface PostRef {
  platform: Platform;
  contentType: ContentType;
  url: string;
  externalId: string | null;
}

export type MediaKind = "video" | "image" | "carousel" | "text";

export interface FetchedPost {
  canonicalUrl: string | null;
  externalId: string | null;
  mediaKind: MediaKind | null;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  /** Lowercase, without "@". */
  authorHandle: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  /** null when the platform hides it (flag metrics_unavailable). */
  views: number | null;
  /** Likes and reactions only. null when hidden. */
  reactions: number | null;
  thumbnailUrl: string | null;
  raw: unknown;
}

export type FetchError =
  "not_found" | "private" | "rate_limited" | "unsupported" | "provider_error";

export type FetchOutcome =
  | { ok: true; post: FetchedPost }
  | { ok: false; error: FetchError; retryable: boolean; detail?: string };
