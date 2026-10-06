import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/api/errors";

/**
 * Route handler plumbing: the `{ error: { code, message } }` envelope, input
 * parsing with Zod, and the same-origin check for writes.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** Runs a handler and turns thrown errors into the error envelope. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.status, error.code, error.message);
    console.error("[api] unexpected error", error);
    return errorResponse(500, "service_unavailable", "Something went wrong");
  }
}

function invalid(error: z.ZodError): HttpError {
  const issue = error.issues[0];
  const where = issue?.path.join(".") || "input";
  return new HttpError(
    400,
    "validation_error",
    `${where}: ${issue?.message ?? "invalid"}`,
  );
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "validation_error", "The body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalid(parsed.error);
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(
  request: Request,
  schema: S,
): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw invalid(parsed.error);
  return parsed.data;
}

/**
 * Writes must come from the app's own pages: the Origin header has to match
 * the app's origin. Defense in depth on top of the SameSite=Lax cookies.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = [
    new URL(request.url).origin,
    process.env.BETTER_AUTH_URL
      ? new URL(process.env.BETTER_AUTH_URL).origin
      : null,
  ];
  if (!origin || !expected.includes(origin))
    throw new HttpError(403, "forbidden", "Cross-origin request");
}

/** Compares two secrets in constant time. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
