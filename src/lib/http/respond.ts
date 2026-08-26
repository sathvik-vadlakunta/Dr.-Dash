import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { isTransformError } from "@/lib/series/types";

/**
 * The response envelope of Section 10.2. Every route handler returns through
 * `ok()` or `err()`; nothing writes a bare `Response` with a JSON body.
 */

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export interface SuccessBody<T> {
  data: T;
  meta: Record<string, unknown>;
}

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  if (!h.has("content-type")) h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function ok<T>(
  data: T,
  meta: Record<string, unknown> = {},
  status = 200,
  headers?: HeadersInit,
): Response {
  return json({ data, meta } satisfies SuccessBody<T>, status, headers);
}

export function err(
  code: string,
  message: string,
  status: number,
  details: unknown[] = [],
  headers?: HeadersInit,
): Response {
  return json({ error: { code, message, details } } satisfies ErrorBody, status, headers);
}

/** `204` carries no body at all. */
export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}

/**
 * The error type every layer throws. `withRoute()` turns it into the envelope
 * above; nothing else needs to know about HTTP status codes.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown[];
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown[] = [],
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  static badRequest(message = "The request body could not be read.", details: unknown[] = []) {
    return new HttpError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Sign in to continue.") {
    return new HttpError(401, "UNAUTHENTICATED", message);
  }
  static forbidden(code = "FORBIDDEN", message = "You do not have access to this.") {
    return new HttpError(403, code, message);
  }
  static notFound(message = "Not found.") {
    return new HttpError(404, "NOT_FOUND", message);
  }
  static conflict(code: string, message: string) {
    return new HttpError(409, code, message);
  }
  static unprocessable(code: string, message: string, details: unknown[] = []) {
    return new HttpError(422, code, message, details);
  }
  static tooManyRequests(message: string, retryAfterSeconds: number) {
    return new HttpError(429, "RATE_LIMITED", message, [], {
      "retry-after": String(retryAfterSeconds),
    });
  }
  static unavailable(code: string, message: string) {
    return new HttpError(503, code, message);
  }
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}

/** Logs an unexpected failure and returns the 500 envelope carrying the request id. */
export function internalError(requestId: string, error: unknown): Response {
  logger.error("route.unhandled", { requestId, error });
  return err(
    "INTERNAL",
    `Something failed on our side. Reference ${requestId}.`,
    500,
    [],
    { "x-request-id": requestId },
  );
}

// ---------------------------------------------------------------------------
// Section 11.3: the shared route wrapper. Every handler goes through it, so
// error shape, request ids, and logging are not a per-handler decision.
// ---------------------------------------------------------------------------

export interface RouteContext {
  requestId: string;
  log: ReturnType<typeof logger.child>;
}

/** Transform failures the UI has copy for (Section 18) map onto 422. */
const TRANSFORM_STATUS: Record<string, number> = {
  BASE_YEAR_INCOMPLETE: 422,
  BASE_YEAR_REQUIRED: 422,
  DEFLATOR_MISSING: 422,
  DENOMINATOR_NOT_COMPARABLE: 422,
  POPULATION_MISSING: 422,
  SERIES_NOT_FOUND: 404,
  TRANSFORM_NOT_ALLOWED: 422,
  UNSUPPORTED_FREQUENCY: 422,
};

export type RouteHandler<A extends unknown[]> = (
  request: Request,
  ...args: A
) => Promise<Response>;

export function withRoute<A extends unknown[]>(
  name: string,
  handler: (request: Request, context: RouteContext, ...args: A) => Promise<Response>,
): RouteHandler<A> {
  return async (request: Request, ...args: A): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const log = logger.child({ requestId, route: name });
    const started = Date.now();

    try {
      const response = await handler(request, { requestId, log }, ...args);
      response.headers.set("x-request-id", requestId);
      log.debug("route.ok", { status: response.status, ms: Date.now() - started });
      return response;
    } catch (error) {
      if (isHttpError(error)) {
        log.warn("route.rejected", { code: error.code, status: error.status });
        return err(error.code, error.message, error.status, error.details, {
          ...error.headers,
          "x-request-id": requestId,
        });
      }

      if (error instanceof ZodError) {
        log.warn("route.invalid", { issues: error.issues.length });
        return err(
          "VALIDATION_FAILED",
          "Some fields were not accepted.",
          422,
          error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          { "x-request-id": requestId },
        );
      }

      if (isTransformError(error)) {
        const status = TRANSFORM_STATUS[error.code] ?? 422;
        log.warn("route.transform_rejected", { code: error.code });
        return err(error.code, error.message, status, [error.details], {
          "x-request-id": requestId,
        });
      }

      return internalError(requestId, error);
    }
  };
}

/** Parse a JSON body, turning a malformed one into `400` rather than a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw HttpError.badRequest();
  }
}
