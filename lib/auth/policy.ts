/**
 * Who may sign in. Pure functions (no env, no I/O) so they can be used by the
 * auth server, the route proxy and unit tests alike.
 */

export const DEFAULT_ALLOWED_DOMAINS = ["crocobet.com"] as const;

/** "crocobet.com, @Example.org" -> ["crocobet.com", "example.org"]. Falls back to crocobet.com. */
export function parseAllowedDomains(value: string | undefined): string[] {
  const domains = (value ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return domains.length > 0 ? domains : [...DEFAULT_ALLOWED_DOMAINS];
}

/** True if the address is exactly at one of the domains (subdomains don't count). */
export function isAllowedEmail(
  email: string | null | undefined,
  domains: readonly string[],
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  return domains.includes(normalized.slice(at + 1));
}

/** Claims we read from the Microsoft Entra ID token. */
export interface EntraIdClaims {
  iss?: unknown;
  aud?: unknown;
  tid?: unknown;
  oid?: unknown;
  name?: unknown;
  email?: unknown;
  preferred_username?: unknown;
}

export type IdentityRejection =
  "missing_claims" | "wrong_tenant" | "domain_not_allowed";

export type IdentityCheck =
  | { ok: true; oid: string; email: string; name: string }
  | { ok: false; reason: IdentityRejection };

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Decides whether an Entra ID token belongs to a Crocobet employee:
 *  1. It was issued by the Crocobet tenant, for this app (iss, tid, aud).
 *  2. The account's email (or sign-in name if no email claim) is at an
 *     allowed domain. This also blocks B2B guests, whose email is their home
 *     address and whose sign-in name contains "#EXT#".
 */
export function checkEntraIdentity(
  claims: EntraIdClaims,
  expected: {
    tenantId: string;
    clientId: string;
    authority: string;
    domains: readonly string[];
  },
): IdentityCheck {
  const oid = text(claims.oid);
  const tid = text(claims.tid);
  if (!oid || !tid) return { ok: false, reason: "missing_claims" };

  const tenantId = expected.tenantId.toLowerCase();
  const issuer = `${expected.authority.replace(/\/+$/, "")}/${tenantId}/v2.0`;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    tid.toLowerCase() !== tenantId ||
    text(claims.iss)?.toLowerCase() !== issuer.toLowerCase() ||
    !audiences.includes(expected.clientId)
  ) {
    return { ok: false, reason: "wrong_tenant" };
  }

  const signInName = text(claims.preferred_username);
  const email = (text(claims.email) ?? signInName)?.toLowerCase();
  if (
    !email ||
    !isAllowedEmail(email, expected.domains) ||
    signInName?.includes("#EXT#")
  ) {
    return { ok: false, reason: "domain_not_allowed" };
  }

  return { ok: true, oid, email, name: text(claims.name) ?? email };
}

/**
 * Where to go after signing in. Only same-origin paths are allowed, so the
 * sign-in page can't be used as an open redirect.
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  try {
    const base = "https://app.invalid";
    const url = new URL(value, base);
    if (
      url.origin !== base ||
      url.pathname.startsWith("/api/") ||
      url.pathname === "/sign-in"
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
