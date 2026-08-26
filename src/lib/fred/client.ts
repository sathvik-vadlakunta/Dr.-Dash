import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Section 8.2. Every FRED call goes through `fredFetch`. Nothing else in the
 * codebase constructs a FRED URL, so the rate limit, the timeout, the retry
 * policy, and the api_key redaction are unavoidable.
 */

const BASE = "https://api.stlouisfed.org/fred";

export class FredError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "FredError";
    this.code = code;
    this.status = status;
  }
}

/** HTTP 400 with a "Bad Request" body: the id does not exist at FRED. */
export class FredBadSeriesError extends FredError {
  readonly seriesId: string;
  constructor(seriesId: string) {
    super("FRED_BAD_SERIES", `FRED does not recognise the series id ${seriesId}.`, 400);
    this.name = "FredBadSeriesError";
    this.seriesId = seriesId;
  }
}

export class FredKeyMissingError extends FredError {
  constructor() {
    super("FRED_KEY_MISSING", "Set FRED_API_KEY to sync live data.", null);
    this.name = "FredKeyMissingError";
  }
}

// ---------------------------------------------------------------------------
// Token bucket. Capacity and refill rate are both
// FRED_MAX_REQUESTS_PER_MINUTE (default 110, under FRED's 120/minute).
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;

class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  private readonly queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly capacity: number) {
    this.tokens = capacity;
  }

  private refill(now: number): void {
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const gained = (elapsed / WINDOW_MS) * this.capacity;
    if (gained < 1 && this.tokens < this.capacity) return;
    this.tokens = Math.min(this.capacity, this.tokens + gained);
    this.lastRefill = now;
  }

  /** Milliseconds until one whole token exists. */
  private waitMs(): number {
    const deficit = Math.max(0, 1 - this.tokens);
    return Math.ceil((deficit / this.capacity) * WINDOW_MS) + 1;
  }

  private pump(): void {
    this.refill(Date.now());
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.queue.shift()?.();
    }
    if (this.queue.length > 0 && this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, this.waitMs());
      // Never hold the process open for a queued request.
      this.timer.unref?.();
    }
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
  }
}

let bucket: TokenBucket | null = null;
function getBucket(): TokenBucket {
  bucket ??= new TokenBucket(config.FRED_MAX_REQUESTS_PER_MINUTE);
  return bucket;
}

/** Test seam: reset the bucket between test files. */
export function __resetRateLimiter(): void {
  bucket = null;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];
const MAX_RETRIES = BACKOFF_MS.length;

function jitter(): number {
  return Math.floor(Math.random() * 251); // 0 to 250 ms
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

/** Strip the key from any string before it reaches a log line or a response. */
export function redactFredUrl(url: string): string {
  return url.replace(/([?&]api_key=)[^&]*/gi, "$1[redacted]");
}

export interface FredFetchOptions {
  /** Only for logging, so a failure names the series it was fetching. */
  seriesId?: string;
  signal?: AbortSignal;
}

/**
 * One FRED GET, rate limited, timed out, retried, and logged. `path` is a
 * FRED path such as `/series` or `/series/observations`.
 */
export async function fredFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options: FredFetchOptions = {},
): Promise<T> {
  if (!config.hasFredKey) throw new FredKeyMissingError();

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", config.FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const safeUrl = redactFredUrl(url.toString());

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await getBucket().acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.FRED_REQUEST_TIMEOUT_MS);
    timeout.unref?.();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const started = Date.now();
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      const ms = Date.now() - started;
      logger.debug("fred.request", {
        seriesId: options.seriesId,
        path,
        ms,
        status: res.status,
        attempt,
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      const body = await res.text().catch(() => "");

      // Never retry a 400 or a 404: the request itself is wrong.
      if (res.status === 400) {
        if (/bad request/i.test(body) && options.seriesId) {
          throw new FredBadSeriesError(options.seriesId);
        }
        throw new FredError("FRED_BAD_REQUEST", `FRED rejected the request: ${safeUrl}`, 400);
      }
      if (res.status === 404) {
        throw new FredError("FRED_NOT_FOUND", `FRED has nothing at ${path}.`, 404);
      }

      if (!RETRYABLE_STATUS.has(res.status)) {
        throw new FredError("FRED_HTTP_ERROR", `FRED returned ${res.status} for ${path}.`, res.status);
      }
      lastError = new FredError(
        "FRED_HTTP_ERROR",
        `FRED returned ${res.status} for ${path}.`,
        res.status,
      );
    } catch (error) {
      if (error instanceof FredError && error.code !== "FRED_HTTP_ERROR") throw error;
      lastError = error;
      logger.warn("fred.request_failed", {
        seriesId: options.seriesId,
        path,
        attempt,
        error,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (attempt < MAX_RETRIES) {
      await sleep((BACKOFF_MS[attempt] ?? 8_000) + jitter());
    }
  }

  if (lastError instanceof FredError) throw lastError;
  throw new FredError(
    "FRED_UNAVAILABLE",
    `FRED did not answer after ${MAX_RETRIES + 1} attempts for ${path}.`,
  );
}

// ---------------------------------------------------------------------------
// Typed endpoint wrappers (Section 8.1)
// ---------------------------------------------------------------------------

export interface FredSeriesMeta {
  id: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  popularity?: number;
  notes?: string;
}

export interface FredObservation {
  date: string;
  value: string;
}

export async function getSeriesMeta(seriesId: string): Promise<FredSeriesMeta> {
  const body = await fredFetch<{ seriess?: FredSeriesMeta[] }>(
    "/series",
    { series_id: seriesId },
    { seriesId },
  );
  const meta = body.seriess?.[0];
  if (!meta) throw new FredBadSeriesError(seriesId);
  return meta;
}

export async function getObservations(
  seriesId: string,
  opts: { observationStart?: string; observationEnd?: string } = {},
): Promise<FredObservation[]> {
  const body = await fredFetch<{ observations?: FredObservation[] }>(
    "/series/observations",
    {
      series_id: seriesId,
      observation_start: opts.observationStart,
      observation_end: opts.observationEnd,
      sort_order: "asc",
    },
    { seriesId },
  );
  return body.observations ?? [];
}

export async function searchSeries(searchText: string, limit = 10): Promise<FredSeriesMeta[]> {
  const body = await fredFetch<{ seriess?: FredSeriesMeta[] }>("/series/search", {
    search_text: searchText,
    limit,
  });
  return body.seriess ?? [];
}

/** Section 8.3. FRED sends missing values as the string ".". */
export function parseFredValue(raw: string): number | null {
  if (raw === "." || raw.trim() === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
