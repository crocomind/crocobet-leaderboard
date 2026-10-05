import "server-only";
import { z } from "zod";
import { LEADERBOARD_PERIODS } from "@/lib/api/types";
import { CONTENT_CATEGORIES, PLATFORM_IDS } from "@/lib/platforms";

/** Query parameters shared by the board endpoints. */
export const boardQuerySchema = z.object({
  category: z.enum(CONTENT_CATEGORIES).default("video"),
  platform: z.enum(["all", ...PLATFORM_IDS]).default("all"),
  period: z.enum(LEADERBOARD_PERIODS).default("month"),
});

export const leaderboardQuerySchema = boardQuerySchema.extend({
  search: z.string().trim().max(100).default(""),
});

export const uuidSchema = z.uuid();
