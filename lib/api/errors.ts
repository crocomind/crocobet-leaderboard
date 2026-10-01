/** Error codes the backend returns in `{ "error": { "code": ... } }`. */
export type ApiErrorCode =
  | "duplicate_video"
  | "invalid_url"
  | "unsupported_platform"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "service_unavailable"
  | "network_error"
  | "config_error"
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor({
    status,
    code,
    message,
  }: {
    status: number;
    code: ApiErrorCode;
    message?: string;
  }) {
    super(message ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
