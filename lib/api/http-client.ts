import { authClient } from "@/lib/auth/client";
import { ApiError, type ApiErrorCode, isAbortError } from "./errors";

/** Backend API scope (Entra "Expose an API"). Unset: requests carry no token. */
const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE;

let cachedToken: { value: string; expiresAt: number } | undefined;

/**
 * Request interceptor: every API request gets these headers. With
 * NEXT_PUBLIC_API_SCOPE set, that's the signed-in user's Microsoft access
 * token for the backend. Better Auth refreshes it with the stored refresh
 * token when it expires. The token is cached in memory until a minute before
 * it expires.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!API_SCOPE) return {};

  if (!cachedToken || cachedToken.expiresAt - 60_000 < Date.now()) {
    // Without a database, the Microsoft account (and its tokens) lives in the account cookie.
    const { data, error } = await authClient.getAccessToken({
      useAccountCookie: true,
    });
    if (error || !data?.accessToken) {
      throw new ApiError({
        status: 401,
        code: "unauthorized",
        message: "No access token",
      });
    }
    cachedToken = {
      value: data.accessToken,
      expiresAt: data.accessTokenExpiresAt
        ? new Date(data.accessTokenExpiresAt).getTime()
        : Date.now() + 5 * 60_000,
    };
  }
  return { Authorization: `Bearer ${cachedToken.value}` };
}

/** The session ended (or the token was rejected): sign in again and come back here. */
function redirectToSignIn() {
  if (typeof window === "undefined") return;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  // A full load on purpose: the server re-reads the session and cached data is dropped.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
}

type QueryValue = string | number | boolean | null | undefined;

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

const KNOWN_CODES = new Set<string>([
  "duplicate_video",
  "invalid_url",
  "unsupported_platform",
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "service_unavailable",
]);

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "duplicate_video";
  if (status === 422 || status === 400) return "validation_error";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  return "unknown";
}

function buildUrl(path: string, query: HttpRequestOptions["query"]): URL {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new ApiError({
      status: 0,
      code: "config_error",
      message:
        "NEXT_PUBLIC_API_BASE_URL is not set. Set it, or set NEXT_PUBLIC_USE_MOCKS=true.",
    });
  }

  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\/+/, ""), base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readErrorBody(
  response: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (error && typeof error === "object") {
        const { code, message } = error as {
          code?: unknown;
          message?: unknown;
        };
        return {
          code: typeof code === "string" ? code : undefined,
          message: typeof message === "string" ? message : undefined,
        };
      }
    }
  } catch {
    // Not JSON; fall back to the status code.
  }
  return {};
}

/** JSON HTTP client for the real backend. All requests go through here. */
export async function request<T>(
  path: string,
  { method = "GET", query, body, signal }: HttpRequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, query);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(await getAuthHeaders()),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: "Network request failed",
    });
  }

  if (response.status === 401) {
    cachedToken = undefined;
    redirectToSignIn();
  }

  if (!response.ok) {
    const { code, message } = await readErrorBody(response);
    throw new ApiError({
      status: response.status,
      code:
        code && KNOWN_CODES.has(code)
          ? (code as ApiErrorCode)
          : codeFromStatus(response.status),
      message,
    });
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
