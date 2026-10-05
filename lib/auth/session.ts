import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { allowedEmailDomains, isAuthConfigured } from "./config";
import { isAllowedEmail } from "./policy";
import { getAuth } from "./server";
import type { SessionUser } from "./types";

export type { SessionUser };

/**
 * The current session for this request, or null. Re-checks the email domain
 * on every request, so a config change takes effect immediately. Cached per
 * request, so the layout and page share one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isAuthConfigured()) return null;
  const session = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null);
  const user = session?.user;
  if (!user || !isAllowedEmail(user.email, allowedEmailDomains())) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
});
