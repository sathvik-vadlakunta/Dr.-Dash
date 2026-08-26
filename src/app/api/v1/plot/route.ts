import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  RECESSION_SLUG,
  defaultPopulationSlug,
  recessionIntervals,
  type RecessionInterval,
} from "@/lib/dashboard/defaults";
import {
  loadSeriesBySlugs,
  makeSeriesLoader,
  prisma,
  type SeriesRow,
} from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { applyTransform } from "@/lib/series/transform";
import type { SeriesData, TransformResult, TransformSpec } from "@/lib/series/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.4. One round trip builds the whole chart: every series, every
 * transform, the recession intervals, and the axis metadata.
 */

const MAX_SERIES = 6;

const growthSchema = z.enum(["NONE", "YOY", "POP", "POP_ANNUALIZED"]);

const transformSchema = z.object({
  real: z.boolean().default(false),
  baseYear: z.number().int().min(1776).max(2200).nullable().default(null),
  deflatorSlug: z.string().nullable().default(null),
  perCapita: z.boolean().default(false),
  populationSlug: z.string().nullable().default(null),
  percentOfSlug: z.string().nullable().default(null),
  growth: growthSchema.default("NONE"),
});

const bodySchema = z.object({
  series: z
    .array(
      z.object({
        slug: z.string().min(1),
        transform: transformSchema,
        axis: z.enum(["left", "right"]).default("left"),
      }),
    )
    .min(1, "Plot at least one series."),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  includeRecessions: z.boolean().default(true),
});

function overlaps(interval: RecessionInterval, start: string | null, end: string | null): boolean {
  if (start && interval.end < start) return false;
  if (end && interval.start > end) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Section 10.4: an in-memory LRU keyed by the exact request JSON, capacity 200,
// TTL 60s. The dashboard replays the same request on every back/forward step,
// and a transform toggled off and on again is the same chart.
// ---------------------------------------------------------------------------

interface CacheEntry {
  body: unknown;
  expiresAt: number;
}

const CACHE_CAPACITY = 200;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Re-insert so the map's insertion order is the recency order.
  cache.delete(key);
  cache.set(key, entry);
  return entry.body;
}

function cacheSet(key: string, body: unknown): void {
  cache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Fill in the defaults the catalog knows about but the client did not send. */
function resolveSpec(spec: TransformSpec, row: SeriesRow, data: SeriesData): TransformSpec {
  return {
    ...spec,
    deflatorSlug: spec.real ? (spec.deflatorSlug ?? row.defaultDeflator) : spec.deflatorSlug,
    populationSlug: spec.perCapita
      ? (spec.populationSlug ?? row.defaultPopulation ?? defaultPopulationSlug(data.frequency))
      : spec.populationSlug,
  };
}

export const POST = withRoute("plot", async (request, { log }) => {
  const raw = await readJson(request);
  const body = bodySchema.parse(raw);

  if (body.series.length > MAX_SERIES) {
    throw HttpError.unprocessable(
      "TOO_MANY_SERIES",
      `A chart holds at most ${MAX_SERIES} series.`,
    );
  }

  const session = await getSession();
  const viewer = session?.user ?? null;

  const cacheKey = JSON.stringify({ body, viewer: viewer?.id ?? null });
  const cached = cacheGet(cacheKey);
  if (cached !== null) {
    return ok(cached, { cached: true }, 200, { "cache-control": "private, max-age=60" });
  }

  const started = Date.now();

  // One query for every plotted series, then one for their observations.
  const loaded = await loadSeriesBySlugs(
    body.series.map((s) => s.slug),
    { start: body.start, end: body.end, viewer },
  );

  const missing = body.series.filter((s) => !loaded.has(s.slug)).map((s) => s.slug);
  if (missing.length === body.series.length) {
    throw HttpError.notFound(`${missing.join(", ")} is not available.`);
  }

  // Helper series are loaded over their whole history, because a base year can
  // sit outside the plotted window (Section 10.4).
  const loader = makeSeriesLoader(viewer);

  const results: Array<
    TransformResult & { slug: string; axis: "left" | "right"; colorIndex: number }
  > = [];

  for (const [index, entry] of body.series.entries()) {
    const found = loaded.get(entry.slug);
    if (!found) continue;

    const spec = resolveSpec(entry.transform, found.row, found.data);
    const result = await applyTransform(found.data, spec, loader);

    results.push({
      ...result,
      slug: entry.slug,
      axis: entry.axis,
      // Section 20.1: the palette is assigned by position, so a chart's colours
      // do not shuffle when a transform changes.
      colorIndex: index % 6,
    });
  }

  // Popularity is fire and forget: it must never delay the chart.
  void prisma.series
    .updateMany({
      where: { slug: { in: results.map((r) => r.slug) } },
      data: { popularity: { increment: 1 } },
    })
    .catch(() => undefined);

  let recessions: RecessionInterval[] = [];
  if (body.includeRecessions) {
    // USREC is hidden from the catalog but is what the bands are drawn from.
    const flag = await loadSeriesBySlugs([RECESSION_SLUG], { includeHidden: true });
    const points = flag.get(RECESSION_SLUG)?.data.points ?? [];
    recessions = recessionIntervals(points).filter((i) => overlaps(i, body.start, body.end));
  }

  const dates = results.flatMap((r) => r.points.map((p) => p.date)).sort();
  const domain = {
    start: body.start ?? dates[0] ?? null,
    end: body.end ?? dates[dates.length - 1] ?? null,
  };

  const axisFor = (side: "left" | "right") => {
    const first = results.find((r) => r.axis === side);
    if (!first) return null;
    return { unitsShort: first.unitsShort, valueKind: first.valueKind };
  };

  const payload = {
    series: results,
    recessions,
    domain,
    axes: { left: axisFor("left"), right: axisFor("right") },
    missing,
  };

  const durationMs = Date.now() - started;
  log.info("plot.duration_ms", {
    durationMs,
    seriesCount: results.length,
    points: results.reduce((n, r) => n + r.points.length, 0),
  });

  cacheSet(cacheKey, payload);

  return ok(payload, { durationMs }, 200, { "cache-control": "private, max-age=60" });
});
