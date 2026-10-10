import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { allowedEmailDomains, missingAuthEnv } from "@/lib/auth/config";
import { safeReturnTo } from "@/lib/auth/policy";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · Croco by Squad" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(first(params.returnTo));

  if (await getSessionUser()) redirect(returnTo);

  const missing = missingAuthEnv();
  if (missing.length > 0) {
    console.error(
      `[auth] Microsoft sign-in is not configured. Missing: ${missing.join(", ")}`,
    );
  }

  return (
    <SignInScreen
      returnTo={returnTo}
      error={first(params.error) ?? null}
      signedOut={first(params.signedOut) === "1"}
      allowedDomains={allowedEmailDomains()}
      configured={missing.length === 0}
      // Variable names only, and only locally; production shows a generic message.
      missingConfig={process.env.NODE_ENV === "development" ? missing : []}
    />
  );
}
