import "server-only";
import { CHALLENGE_BOARD_ID } from "@/lib/api/types";
import { HttpError } from "@/lib/server/http";
import { uuidSchema } from "@/lib/server/schemas";

/** A leaderboard id from the URL: "challenge" or a round's id. */
export function boardParam(value: string): string {
  if (value === CHALLENGE_BOARD_ID || uuidSchema.safeParse(value).success)
    return value;
  throw new HttpError(404, "not_found", "Leaderboard not found");
}

/** An employee id from the URL. */
export function employeeParam(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(404, "not_found", "Employee not found");
  return parsed.data;
}
