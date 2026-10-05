import "server-only";
import { parseAllowedDomains } from "./policy";

/** Server-only environment variables. Fill them in .env (local) and in Vercel. */
const REQUIRED_ENV = [
  "BETTER_AUTH_SECRET",
  "AUTH_MICROSOFT_TENANT_ID",
  "AUTH_MICROSOFT_CLIENT_ID",
  "AUTH_MICROSOFT_CLIENT_SECRET",
] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthConfig {
  /** Public URL of the app, e.g. https://leaderboard.crocomind.com. Inferred from the request if unset. */
  baseURL: string | undefined;
  secret: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Entra login host. Only change for sovereign clouds or a local mock. */
  authority: string;
  allowedDomains: string[];
  /** Optional backend API scope; when set, sign-in also requests an access token for it. */
  apiScope: string | undefined;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Names of required variables that are empty. Also flags a non-GUID tenant ID. */
export function missingAuthEnv(): string[] {
  const missing: string[] = REQUIRED_ENV.filter((name) => !env(name));
  const tenantId = env("AUTH_MICROSOFT_TENANT_ID");
  // "common"/"organizations" would let other organizations in; require the Crocobet tenant GUID.
  if (tenantId && !GUID.test(tenantId))
    missing.push("AUTH_MICROSOFT_TENANT_ID (must be the tenant GUID)");
  return missing;
}

export function isAuthConfigured(): boolean {
  return missingAuthEnv().length === 0;
}

export function allowedEmailDomains(): string[] {
  return parseAllowedDomains(env("AUTH_ALLOWED_EMAIL_DOMAINS"));
}

export class AuthNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Microsoft sign-in is not configured. Missing: ${missing.join(", ")}`,
    );
    this.name = "AuthNotConfiguredError";
  }
}

export function readAuthConfig(): AuthConfig {
  const missing = missingAuthEnv();
  if (missing.length > 0) throw new AuthNotConfiguredError(missing);
  return {
    baseURL: env("BETTER_AUTH_URL"),
    secret: env("BETTER_AUTH_SECRET")!,
    tenantId: env("AUTH_MICROSOFT_TENANT_ID")!.toLowerCase(),
    clientId: env("AUTH_MICROSOFT_CLIENT_ID")!,
    clientSecret: env("AUTH_MICROSOFT_CLIENT_SECRET")!,
    authority: (
      env("AUTH_MICROSOFT_AUTHORITY") ?? "https://login.microsoftonline.com"
    ).replace(/\/+$/, ""),
    allowedDomains: allowedEmailDomains(),
    apiScope: env("NEXT_PUBLIC_API_SCOPE"),
  };
}
