"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth calls (same origin: /api/auth). */
export const authClient = createAuthClient();

export const MICROSOFT_PROVIDER_ID = "microsoft";

export function signInWithMicrosoft(returnTo: string) {
  return authClient.signIn.social({
    provider: MICROSOFT_PROVIDER_ID,
    callbackURL: returnTo,
    // Errors come back as /sign-in?returnTo=…&error=CODE.
    errorCallbackURL: `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
  });
}

/** Signs out of this app (not of Microsoft) and goes to the sign-in page. */
export async function signOut() {
  await authClient.signOut().catch(() => undefined);
  // A full load on purpose, so no signed-in data stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/sign-in?signedOut=1");
}
