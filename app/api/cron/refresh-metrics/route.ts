import { getServerConfig } from "@/lib/server/config";
import { getDb } from "@/lib/server/db/client";
import { handle, HttpError, json, safeEqual } from "@/lib/server/http";
import { runSync } from "@/lib/server/services/sync";

/** Within Vercel's limit; the job stops starting new batches 30 seconds before it. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel Cron, at 04:00 and 16:00 UTC (08:00 and 20:00 in Tbilisi). Vercel
 * sends `Authorization: Bearer $CRON_SECRET`; anything else gets a 401.
 * proxy.ts doesn't guard /api/cron, so this check is the only gate.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const config = getServerConfig();
    const header = request.headers.get("authorization") ?? "";
    if (!config.cronSecret || !safeEqual(header, `Bearer ${config.cronSecret}`))
      throw new HttpError(401, "unauthorized", "Missing or wrong cron secret");
    const result = await runSync(getDb(), config, {
      trigger: "cron",
      deadline: Date.now() + (maxDuration - 30) * 1000,
    });
    return json(result);
  });
}
