import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth/session";

/** The whole app is this one route; views switch client-side via ?view=. */
export default async function HomePage() {
  // proxy.ts already redirects signed-out visitors; this guards the page itself too.
  if (!(await getSessionUser())) redirect("/sign-in");

  return (
    <Suspense>
      <AppShell />
    </Suspense>
  );
}
