import type { ContentCategory } from "@/lib/platforms";

/**
 * A post's score on its board.
 *  - Video: views + reactions.
 *  - Static: reactions only (any views a platform reports are ignored).
 *
 * "Reactions" means likes and reactions only (TikTok likes, Instagram likes,
 * Facebook and LinkedIn total reactions). Comments, shares, saves and
 * reposts never count. Unknown views count as 0 until an admin enters them.
 */
export function postScore(
  category: ContentCategory,
  views: number | null,
  reactions: number,
): number {
  const safeReactions = Math.max(0, reactions);
  return category === "video"
    ? Math.max(0, views ?? 0) + safeReactions
    : safeReactions;
}

/** Views shown for a post: always null on static content. */
export function displayedViews(
  category: ContentCategory,
  views: number | null,
): number | null {
  return category === "video" ? views : null;
}
