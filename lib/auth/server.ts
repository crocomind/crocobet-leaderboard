import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import type { MicrosoftEntraIDProfile } from "better-auth/social-providers";
import { decodeJwt } from "jose";
import { scheduleProfileSync } from "@/lib/server/services/profile";
import { type AuthConfig, readAuthConfig } from "./config";
import { checkEntraIdentity, type IdentityRejection } from "./policy";

/** Absolute session lifetime. Afterwards the user signs in again (usually one click, via Microsoft SSO). */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function signInErrorRedirect(config: AuthConfig, reason: IdentityRejection) {
  const location = `${config.baseURL ?? ""}/sign-in?error=${reason}`;
  return new APIError("FOUND", undefined, { Location: location });
}

function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: "Croco by Squad",
    baseURL: config.baseURL,
    secret: config.secret,
    telemetry: { enabled: false },
    // No database: the session and the Microsoft tokens live in encrypted
    // (JWE), chunked, httpOnly cookies. See README → Authentication.
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_MAX_AGE_SECONDS,
        strategy: "jwe",
        refreshCache: false,
      },
    },
    account: {
      storeStateStrategy: "cookie",
      storeAccountCookie: true,
    },
    user: {
      // The Entra object ID, carried in the session cookie: the API keys
      // employees on it (Better Auth's own user id isn't stable without a database).
      additionalFields: {
        entraOid: { type: "string", required: false, input: false },
      },
    },
    rateLimit: {
      // Better Auth allows 3 /sign-in requests per 10 s per IP by default, which
      // is meant for password logins. Here sign-in only builds the Microsoft
      // redirect (Microsoft does the checking), and a whole office can share one IP.
      customRules: { "/sign-in/social": { window: 10, max: 60 } },
    },
    socialProviders: {
      microsoft: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        // Single tenant: only accounts in the Crocobet directory can authenticate.
        tenantId: config.tenantId,
        authority: config.authority,
        // Show the account picker, so signing out and back in can switch accounts.
        prompt: "select_account",
        disableDefaultScope: true,
        // User.Read lets the API copy the name, department and photo from
        // Microsoft Graph. An access token covers one resource, so with an
        // external API scope set, the token is for that API instead.
        scope: [
          "openid",
          "profile",
          "email",
          "offline_access",
          ...(config.apiScope ? [config.apiScope] : ["User.Read"]),
        ],
        // Runs on every sign-in. The ID token comes straight from Microsoft's
        // token endpoint (TLS + client secret); we check that it's for this
        // tenant and app and that the account is at an allowed email domain.
        async getUserInfo(tokens) {
          if (!tokens.idToken) return null;
          const claims = decodeJwt<MicrosoftEntraIDProfile>(tokens.idToken);
          const identity = checkEntraIdentity(claims, {
            tenantId: config.tenantId,
            clientId: config.clientId,
            authority: config.authority,
            domains: config.allowedDomains,
          });
          if (!identity.ok) throw signInErrorRedirect(config, identity.reason);

          // Profile and photo, after the response; never blocks sign-in.
          if (!config.apiScope)
            scheduleProfileSync(
              { oid: identity.oid, email: identity.email, name: identity.name },
              tokens.accessToken,
            );

          // The account is keyed on the Entra object ID (oid), read from `data`.
          return {
            user: {
              name: identity.name,
              email: identity.email,
              emailVerified: true,
              entraOid: identity.oid,
            },
            data: claims,
          };
        },
      },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/**
 * The Better Auth instance, created on first use so the app still builds
 * before the secrets are filled in. Throws AuthNotConfiguredError until then.
 */
export function getAuth() {
  instance ??= createAuth(readAuthConfig());
  return instance;
}
