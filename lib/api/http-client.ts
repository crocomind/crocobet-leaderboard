import { ApiError, type ApiErrorCode, isAbortError } from "./errors";

/**
 * Request interceptor: every API request gets these headers.
 *
 * Authentication goes here. With Entra ID this becomes something like:
 *   const token = await acquireTokenSilently();
 *   return { Authorization: `Bearer ${token}` };
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {};
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
