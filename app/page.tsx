import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

/** The whole app is this one route; views switch client-side via ?view=. */
export default function HomePage() {
  return (
    <Suspense>
      <AppShell />
    </Suspense>
  );
}
