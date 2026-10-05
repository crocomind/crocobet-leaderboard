import "server-only";
import { analyzePostUrl, type Platform } from "@/lib/platforms";
import type {
  FetchError,
  FetchedPost,
  FetchOutcome,
  MediaKind,
  PostRef,
} from "@/lib/post-data";

/**
 * Everything platform-specific about the Apify actors in one place: which
 * actor, its input for a list of post URLs, and how its dataset items map to
 * FetchedPost. Field names follow each actor's dataset schema on apify.com.
 */

export interface ActorSpec {
  /** Default actor id ("username~actor-name"); APIFY_ACTOR_<PLATFORM> overrides it. */
  actor: string;
  /**
   * Memory per run, within the actor's limits. The four together stay under
   * the free plan's 8 GB, so a platform's runs never wait for another's.
   */
  memoryMb: number;
  /** The URL the actor is given for a post. */
  inputUrl: (ref: PostRef) => string;
  input: (urls: string[]) => Record<string, unknown>;
  /** Matching keys for an item (input URL, post ID, canonical URL), then its outcome. */
  map: (item: Record<string, unknown>) => {
    keys: string[];
    outcome: FetchOutcome;
  };
}

type Item = Record<string, unknown>;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
/** Counts; hidden ones (null, -1, missing) become null. */
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
const obj = (value: unknown): Item =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Item)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const date = (value: unknown): Date | null => {
  const parsed =
    typeof value === "number"
      ? new Date(value < 1e12 ? value * 1000 : value)
      : typeof value === "string"
        ? new Date(value)
        : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

/** Keys for matching: the canonical link and the post's own ID (as lib/platforms derives them). */
export function keysOf(...urls: unknown[]): string[] {
  const keys = new Set<string>();
  for (const url of urls) {
    const text = str(url);
    if (!text) continue;
    keys.add(text);
    const analysis = analyzePostUrl(text);
    if (analysis.status === "valid") {
      keys.add(analysis.normalizedUrl);
      if (analysis.externalId)
        keys.add(`${analysis.platform}:${analysis.externalId}`);
    }
  }
  return [...keys];
}

/** The keys a ref is looked up by, in the same form as keysOf(). */
export function refKeys(ref: PostRef, inputUrl: string): string[] {
  return [
    inputUrl,
    ref.url,
    ...(ref.externalId ? [`${ref.platform}:${ref.externalId}`] : []),
  ];
}

/** Platform hosts with "www.", the form the actors document. */
function www(url: string): string {
  return url.replace(
    /^https:\/\/(instagram|facebook|tiktok|linkedin)\.com\//,
    "https://www.$1.com/",
  );
}

function failure(item: Item): FetchOutcome | null {
  const error = str(item.error) ?? str(item.errorCode);
  if (!error) return null;
  const text = `${error} ${str(item.errorDescription) ?? ""}`.toLowerCase();
  const kind: FetchError = text.includes("private")
    ? "private"
    : text.includes("not found") ||
        text.includes("not_found") ||
        text.includes("does not exist") ||
        text.includes("unavailable")
      ? "not_found"
      : "provider_error";
  return { ok: false, error: kind, retryable: kind === "provider_error" };
}

function post(fields: Omit<FetchedPost, "raw">, item: Item): FetchOutcome {
  return { ok: true, post: { ...fields, raw: trimRaw(item) } };
}

/** The raw item without long strings and big arrays, for the audit snapshot. */
function trimRaw(item: Item): unknown {
  const keep: Item = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === "string") keep[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean")
      keep[key] = value;
  }
  return keep;
}

const tiktok: ActorSpec = {
  actor: "clockworks~tiktok-video-scraper",
  memoryMb: 2048,
  inputUrl: (ref) => www(ref.url),
  input: (urls) => ({
    postURLs: urls,
    scrapeRelatedVideos: false,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  }),
  map: (item) => {
    const keys = keysOf(
      item.submittedVideoUrl,
      item.input,
      item.url,
      item.webVideoUrl,
    );
    if (str(item.id)) keys.push(`tiktok:${str(item.id)}`);
    const failed = failure(item);
    if (failed) return { keys, outcome: failed };
    const author = obj(item.authorMeta);
    const mediaKind: MediaKind =
      item.isSlideshow === true ? "carousel" : "video";
    return {
      keys,
      outcome: post(
        {
          canonicalUrl: str(item.webVideoUrl),
          externalId: str(item.id),
          mediaKind,
          caption: str(item.text),
          hashtags: list(item.hashtags)
            .map((tag) => str(obj(tag).name))
            .filter((tag): tag is string => tag !== null),
          mentions: [
            ...list(item.mentions).map((mention) =>
              str(mention)?.replace(/^@/, ""),
            ),
            ...list(item.detailedMentions).map((mention) =>
              str(obj(mention).name),
            ),
          ].filter((mention): mention is string => Boolean(mention)),
          authorHandle: str(author.name)?.toLowerCase() ?? null,
          authorName: str(author.nickName),
          publishedAt: date(item.createTimeISO) ?? date(item.createTime),
          views: count(item.playCount),
          reactions: count(item.diggCount),
          thumbnailUrl: str(obj(item.videoMeta).coverUrl),
        },
        item,
      ),
    };
  },
};

const instagram: ActorSpec = {
  actor: "apify~instagram-scraper",
  memoryMb: 1024,
  // Reels open at /p/<code> too, so every post runs in the documented "posts" mode.
  inputUrl: (ref) =>
    ref.externalId
      ? `https://www.instagram.com/p/${ref.externalId}/`
      : www(ref.url),
  input: (urls) => ({
    directUrls: urls,
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  }),
  map: (item) => {
    const keys = keysOf(item.inputUrl, item.url);
    if (str(item.shortCode)) keys.push(`instagram:${str(item.shortCode)}`);
    const failed = failure(item);
    if (failed) return { keys, outcome: failed };
    const type = str(item.type);
    const video = type === "Video";
    return {
      keys,
      outcome: post(
        {
          canonicalUrl: str(item.url),
          externalId: str(item.shortCode),
          mediaKind: video
            ? "video"
            : type === "Sidecar"
              ? "carousel"
              : "image",
          caption: str(item.caption),
          hashtags: list(item.hashtags)
            .map(str)
            .filter((tag): tag is string => tag !== null),
          mentions: [
            ...list(item.mentions).map(str),
            ...list(item.taggedUsers).map((user) => str(obj(user).username)),
          ].filter((mention): mention is string => mention !== null),
          authorHandle: str(item.ownerUsername)?.toLowerCase() ?? null,
          authorName: str(item.ownerFullName),
          publishedAt: date(item.timestamp),
          // videoViewCount is deprecated by Instagram; plays are the current number.
          views: video
            ? (count(item.videoPlayCount) ?? count(item.videoViewCount))
            : null,
          reactions: count(item.likesCount),
          thumbnailUrl: str(item.displayUrl),
        },
        item,
      ),
    };
  },
};

const facebook: ActorSpec = {
  actor: "apify~facebook-posts-scraper",
  memoryMb: 2048,
  inputUrl: (ref) => www(ref.url),
  input: (urls) => ({
    startUrls: urls.map((url) => ({ url })),
    captionText: false,
  }),
  map: (item) => {
    const keys = keysOf(
      item.inputUrl,
      item.url,
      item.topLevelUrl,
      item.facebookUrl,
    );
    if (str(item.postId)) keys.push(`facebook:${str(item.postId)}`);
    const failed = failure(item);
    if (failed) return { keys, outcome: failed };
    const user = obj(item.user);
    const media = list(item.media).map(obj);
    const references = list(item.textReferences).map(obj);
    const video =
      item.isVideo === true ||
      media.some((entry) => str(entry.__typename) === "Video");
    return {
      keys,
      outcome: post(
        {
          canonicalUrl: str(item.url),
          externalId: str(item.postId),
          mediaKind: video ? "video" : media.length > 0 ? "image" : "text",
          caption: str(item.text),
          hashtags: references
            .map(
              (reference) =>
                /\/hashtag\/([^/?#]+)/.exec(str(reference.url) ?? "")?.[1],
            )
            .filter((tag): tag is string => Boolean(tag))
            .map(decodeURIComponent),
          mentions: references
            .filter(
              (reference) => !/\/hashtag\//.test(str(reference.url) ?? ""),
            )
            .map((reference) => str(reference.name) ?? str(reference.text))
            .filter((mention): mention is string => mention !== null),
          authorHandle:
            (str(item.pageName) ?? str(user.id))?.toLowerCase() ?? null,
          authorName: str(user.name),
          publishedAt: date(item.time) ?? date(item.timestamp),
          views: video
            ? (count(item.viewsCount) ?? count(item.videoPostViewCount))
            : null,
          // "likes" is the total of every reaction type.
          reactions: count(item.likes),
          thumbnailUrl: str(media[0]?.thumbnail),
        },
        item,
      ),
    };
  },
};

const linkedin: ActorSpec = {
  actor: "harvestapi~linkedin-profile-posts",
  memoryMb: 256,
  inputUrl: (ref) => www(ref.url),
  input: (urls) => ({
    targetUrls: urls,
    maxPosts: 1,
    scrapeReactions: false,
    scrapeComments: false,
  }),
  map: (item) => {
    const keys = keysOf(item.linkedinUrl, item.inputUrl, item.url);
    if (str(item.id)) keys.push(`linkedin:activity:${str(item.id)}`);
    const failed = failure(item);
    if (failed) return { keys, outcome: failed };
    const author = obj(item.author);
    const posted = obj(item.postedAt);
    const hidden = obj(item.socialContent).hideReactionsCount === true;
    const images = list(item.postImages).map(obj);
    return {
      keys,
      outcome: post(
        {
          canonicalUrl: str(item.linkedinUrl),
          externalId: str(item.id) ? `activity:${str(item.id)}` : null,
          mediaKind: images.length > 0 || item.document ? "image" : "text",
          caption: str(item.content),
          hashtags: [],
          mentions: [],
          authorHandle: str(author.publicIdentifier)?.toLowerCase() ?? null,
          authorName: str(author.name),
          publishedAt: date(posted.date) ?? date(posted.timestamp),
          views: null,
          reactions: hidden ? null : count(obj(item.engagement).likes),
          thumbnailUrl: str(images[0]?.url),
        },
        item,
      ),
    };
  },
};

export const ACTORS: Record<Platform, ActorSpec> = {
  tiktok,
  instagram,
  facebook,
  linkedin,
};
