import type { ContentType } from "@/lib/platforms";

/**
 * Some platforms encode the publish time in the post ID, which is a good
 * fallback when the data provider doesn't report it.
 *  - TikTok video and photo post IDs: the top 32 bits are Unix seconds (id >> 32).
 *  - LinkedIn activity/ugcPost IDs: the top 41 of the ID's 63 significant
 *    bits are Unix milliseconds (id >> 22).
 */
const EARLIEST = Date.UTC(2016, 0, 1);
const SLACK_MS = 2 * 86_400_000;

function plausible(ms: number, now: number): Date | null {
  return ms >= EARLIEST && ms <= now + SLACK_MS ? new Date(ms) : null;
}

export function publishedAtFromExternalId(
  contentType: ContentType,
  externalId: string | null,
  now: Date = new Date(),
): Date | null {
  if (!externalId) return null;

  if (
    (contentType === "tiktok_video" || contentType === "tiktok_photo") &&
    /^\d{15,20}$/.test(externalId)
  ) {
    return plausible(Number(BigInt(externalId) >> 32n) * 1000, now.getTime());
  }

  if (contentType === "linkedin_post") {
    const match = /^(?:activity|ugcPost):(\d{15,20})$/.exec(externalId);
    if (match?.[1])
      return plausible(Number(BigInt(match[1]) >> 22n), now.getTime());
  }

  return null;
}
