import { categoryOf } from "@/lib/platforms";
import { publishedAtFromExternalId } from "@/lib/post-ids";
import type {
  FetchOutcome,
  FetchedPost,
  MediaKind,
  PostRef,
} from "@/lib/post-data";

/**
 * The "fixture" data provider: deterministic fake data derived from a hash of
 * the URL, so the whole pipeline (checks, flags, snapshots, ranking) runs
 * without a provider account. Used in development, tests, previews and by the
 * mock API. The same URL always gives the same post; its metrics grow with
 * the post's age.
 */

const DAY_MS = 86_400_000;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function prng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAPTIONS = [
  "A day in the life at Crocobet HQ",
  "Our support team's morning ritual",
  "Behind the scenes of our office makeover",
  "Friday team lunch",
  "Hackathon highlights",
  "Team building weekend in Kakheti",
  "Lessons from my first 100 days",
  "ჩვენი გუნდის ერთი დღე",
  "პარასკევის განწყობა",
  "გუნდური ლაშქრობა ყაზბეგში",
];

function handleFromUrl(ref: PostRef, random: () => number): string {
  const path = ref.url.replace(/^https:\/\/[^/]+/, "");
  const tiktok = /^\/@([\w.]+)\//.exec(path);
  if (tiktok?.[1]) return tiktok[1].toLowerCase();
  const linkedIn = /^\/posts\/([\w-]+?)_/.exec(path);
  if (linkedIn?.[1]) return linkedIn[1].toLowerCase();
  return `creator.${Math.floor(random() * 9000) + 1000}`;
}

function mediaKindFor(ref: PostRef, random: () => number): MediaKind {
  if (categoryOf(ref.contentType) === "video") return "video";
  if (ref.contentType === "linkedin_post")
    return random() < 0.5 ? "text" : "image";
  // Some "photo" links are really videos; the pipeline reclassifies them.
  const roll = random();
  return roll < 0.08 ? "video" : roll < 0.4 ? "carousel" : "image";
}

export interface FixtureOptions {
  now: Date;
  /** When the post was submitted: anchors a stable publish date for platforms whose IDs don't encode it. */
  submittedAt?: Date;
  /** Words that make the caption pass the campaign check. Default "#CrocoBySquad". */
  tag?: string;
}

export function fixtureFetch(
  ref: PostRef,
  { now, submittedAt = now, tag = "#CrocoBySquad" }: FixtureOptions,
): FetchOutcome {
  const random = prng(hash(ref.url));

  const reachability = random();
  if (reachability < 0.04)
    return { ok: false, error: "not_found", retryable: false };
  if (reachability < 0.08)
    return { ok: false, error: "private", retryable: false };

  const fromId = publishedAtFromExternalId(
    ref.contentType,
    ref.externalId,
    now,
  );
  const ageDays = 0.2 + random() * 6;
  const publishedAt =
    fromId ??
    (random() < 0.85
      ? new Date(submittedAt.getTime() - ageDays * DAY_MS)
      : null);

  const mediaKind = mediaKindFor(ref, random);
  const tagged = random() < 0.78;
  const caption = `${CAPTIONS[Math.floor(random() * CAPTIONS.length)]}${tagged ? ` ${tag}` : ""}`;
  const authorHandle = handleFromUrl(ref, random);

  // Lifetime totals, reached gradually: about 63% after three days.
  const base = Math.exp(7.4 + (random() - 0.5) * 2.4);
  const isVideo = mediaKind === "video";
  const age = Math.max(
    0,
    (now.getTime() - (publishedAt ?? submittedAt).getTime()) / DAY_MS,
  );
  const growth = 1 - Math.exp(-age / 3);
  const hiddenViews = isVideo && random() < 0.05;
  const views = isVideo && !hiddenViews ? Math.round(base * growth) : null;
  const reactions = Math.round(base * (0.04 + random() * 0.08) * growth);

  const post: FetchedPost = {
    canonicalUrl: ref.url,
    externalId: ref.externalId,
    mediaKind,
    caption,
    hashtags: tagged ? [tag.replace(/^#/, "")] : [],
    mentions: [],
    authorHandle,
    authorName: null,
    publishedAt,
    views,
    reactions,
    thumbnailUrl: null,
    raw: { fixture: true, base: Math.round(base) },
  };
  return { ok: true, post };
}
