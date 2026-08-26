import type { PrismaClient, Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  FredBadSeriesError,
  getObservations,
  getSeriesMeta,
  parseFredValue,
  type FredObservation,
  type FredSeriesMeta,
} from "@/lib/fred/client";
import { mapFrequency } from "@/lib/fred/map";
import { logger } from "@/lib/logger";
import {
  COMPUTED_SERIES,
  topologicalOrder,
  type ComputedDef,
} from "@/lib/series/computed";
import type { Frequency, Point, SeriesData } from "@/lib/series/types";

/**
 * Section 8.5. The whole ingestion path. It is written against a `PrismaClient`
 * parameter rather than the singleton so an integration test can hand it a
 * client bound to its own schema.
 */

export interface SyncSeriesResult {
  slug: string;
  skipped: boolean;
  updated: boolean;
  observationsWritten: number;
  reason?: string;
}

export interface SyncError {
  slug: string;
  code: string;
  message: string;
}

export interface SyncAllResult {
  syncRunId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  seriesAttempted: number;
  seriesUpdated: number;
  observationsWritten: number;
  errors: SyncError[];
  results: SyncSeriesResult[];
}

// ---------------------------------------------------------------------------
// Section 8.4: date normalization. FRED already returns period start dates, so
// this asserts rather than repairs. A silent repair would hide a FRED change.
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertPeriodStart(date: string, frequency: Frequency, seriesId: string): string {
  if (!ISO_DATE.test(date)) {
    throw new Error(`${seriesId}: FRED returned a non-ISO date "${date}".`);
  }
  const month = date.slice(5, 7);
  const day = date.slice(8, 10);

  switch (frequency) {
    case "MONTHLY":
      if (day !== "01") {
        throw new Error(`${seriesId}: monthly observation "${date}" is not a period start.`);
      }
      break;
    case "QUARTERLY":
      if (!["01", "04", "07", "10"].includes(month) || day !== "01") {
        throw new Error(`${seriesId}: quarterly observation "${date}" is not a period start.`);
      }
      break;
    case "ANNUAL":
      if (month !== "01" || day !== "01") {
        throw new Error(`${seriesId}: annual observation "${date}" is not a period start.`);
      }
      break;
    case "WEEKLY":
    case "DAILY":
      // Accepted as given.
      break;
  }
  return date;
}

/** `date` minus `days`, as an ISO date, without letting a timezone shift it. */
export function isoMinusDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const ms = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Batched upsert
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

/**
 * Section 8.5 step 7. `createMany({skipDuplicates})` is wrong here because it
 * does not update an existing row, and FRED revises history: a re-sync has to
 * overwrite the values it already stored.
 */
export async function upsertObservations(
  db: PrismaClient,
  seriesId: string,
  points: Point[],
): Promise<number> {
  let written = 0;

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;

    const values: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((p, j) => {
      const base = j * 3;
      tuples.push(`($${base + 1}, $${base + 2}::date, $${base + 3}::double precision)`);
      values.push(seriesId, p.date, p.value);
    });

    const sql =
      `INSERT INTO "Observation" ("seriesId", "date", "value") VALUES ${tuples.join(", ")} ` +
      `ON CONFLICT ("seriesId", "date") DO UPDATE SET "value" = EXCLUDED."value"`;

    written += await db.$executeRawUnsafe(sql, ...values);
  }

  return written;
}

// ---------------------------------------------------------------------------
// syncSeries
// ---------------------------------------------------------------------------

export interface SyncSeriesOptions {
  full?: boolean;
  db?: PrismaClient;
  /** Injectable for tests; defaults to the real FRED client. */
  fetchMeta?: (seriesId: string) => Promise<FredSeriesMeta>;
  fetchObservations?: (
    seriesId: string,
    opts: { observationStart?: string },
  ) => Promise<FredObservation[]>;
}

export async function syncSeries(
  slug: string,
  options: SyncSeriesOptions = {},
): Promise<SyncSeriesResult> {
  const db = options.db ?? defaultPrisma;
  const full = options.full ?? false;
  const fetchMeta = options.fetchMeta ?? getSeriesMeta;
  const fetchObservations = options.fetchObservations ?? getObservations;

  const series = await db.series.findUnique({ where: { slug } });
  if (!series) {
    return { slug, skipped: true, updated: false, observationsWritten: 0, reason: "NOT_FOUND" };
  }
  if (series.source !== "FRED" || !series.fredId) {
    return { slug, skipped: true, updated: false, observationsWritten: 0, reason: "NOT_FRED" };
  }

  const meta = await fetchMeta(series.fredId);
  const metaLastUpdated = new Date(meta.last_updated);

  // Step 3: nothing at FRED has changed since the last successful sync.
  if (
    !full &&
    series.fredLastUpdated !== null &&
    metaLastUpdated.getTime() <= series.fredLastUpdated.getTime()
  ) {
    await db.series.update({ where: { id: series.id }, data: { lastSyncedAt: new Date() } });
    return { slug, skipped: true, updated: false, observationsWritten: 0, reason: "UNCHANGED" };
  }

  // Step 4: a 400 day overlap catches revisions to recent history. Only a full
  // sync catches benchmark revisions to older data, which is why the admin page
  // carries a per-series "Full resync".
  const observationStart = full
    ? "1776-07-04"
    : series.observationEnd
      ? isoMinusDays(toIsoDate(series.observationEnd), 400)
      : "1776-07-04";

  const raw = await fetchObservations(series.fredId, { observationStart });

  const frequency = mapFrequency(meta.frequency_short);
  const points: Point[] = raw.map((o) => ({
    date: assertPeriodStart(o.date, frequency, series.fredId ?? slug),
    value: parseFredValue(o.value),
  }));

  const written = await upsertObservations(db, series.id, points);

  if (meta.units.trim() !== series.units.trim() || frequency !== series.frequency) {
    logger.warn("fred.metadata_changed", {
      slug,
      unitsBefore: series.units,
      unitsAfter: meta.units,
      frequencyBefore: series.frequency,
      frequencyAfter: frequency,
    });
  }

  const bounds = await db.observation.aggregate({
    where: { seriesId: series.id },
    _min: { date: true },
    _max: { date: true },
  });

  await db.series.update({
    where: { id: series.id },
    data: {
      observationStart: bounds._min.date,
      observationEnd: bounds._max.date,
      fredLastUpdated: metaLastUpdated,
      lastSyncedAt: new Date(),
      units: meta.units,
      frequency,
    },
  });

  return { slug, skipped: false, updated: true, observationsWritten: written };
}

// ---------------------------------------------------------------------------
// Constructed series (Section 7.3)
// ---------------------------------------------------------------------------

async function loadSeriesData(db: PrismaClient, slug: string): Promise<SeriesData | null> {
  const s = await db.series.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      shortLabel: true,
      frequency: true,
      kind: true,
      units: true,
      unitsShort: true,
      unitMultiplier: true,
      aggregation: true,
      isNominal: true,
      isRealAlready: true,
    },
  });
  if (!s) return null;

  const obs = await db.observation.findMany({
    where: { seriesId: s.id },
    orderBy: { date: "asc" },
    select: { date: true, value: true },
  });

  return {
    slug: s.slug,
    shortLabel: s.shortLabel,
    frequency: s.frequency,
    kind: s.kind,
    units: s.units,
    unitsShort: s.unitsShort,
    unitMultiplier: s.unitMultiplier,
    aggregation: s.aggregation,
    isNominal: s.isNominal,
    isRealAlready: s.isRealAlready,
    points: obs.map((o) => ({ date: toIsoDate(o.date), value: o.value })),
  };
}

export interface RecomputeResult {
  slug: string;
  observationsWritten: number;
  skipped?: string;
}

/**
 * Recompute every constructed series in dependency order, after all its inputs
 * have been updated. `topologicalOrder` throws `CIRCULAR_DEPENDENCY` if the
 * registry ever grows a cycle.
 */
export async function recomputeConstructedSeries(
  db: PrismaClient = defaultPrisma,
  defs: ComputedDef[] = COMPUTED_SERIES,
): Promise<RecomputeResult[]> {
  const out: RecomputeResult[] = [];

  for (const def of topologicalOrder(defs)) {
    const target = await db.series.findUnique({ where: { slug: def.slug }, select: { id: true } });
    if (!target) {
      out.push({ slug: def.slug, observationsWritten: 0, skipped: "NOT_SEEDED" });
      continue;
    }

    const inputs: Record<string, SeriesData> = {};
    let missing: string | null = null;
    for (const dep of def.dependsOn) {
      const data = await loadSeriesData(db, dep);
      if (!data || data.points.length === 0) {
        missing = dep;
        break;
      }
      inputs[dep] = data;
    }
    if (missing !== null) {
      out.push({ slug: def.slug, observationsWritten: 0, skipped: `NO_DATA:${missing}` });
      continue;
    }

    const points = def.compute(inputs).filter((p) => p.value !== null);

    // A recompute can shrink the series (a revised input, a shorter overlap),
    // so replace rather than merge.
    await db.observation.deleteMany({ where: { seriesId: target.id } });
    const written = await upsertObservations(db, target.id, points);

    await db.series.update({
      where: { id: target.id },
      data: {
        observationStart: points[0] ? new Date(`${points[0].date}T00:00:00Z`) : null,
        observationEnd: points.at(-1) ? new Date(`${points.at(-1)?.date}T00:00:00Z`) : null,
        lastSyncedAt: new Date(),
      },
    });

    out.push({ slug: def.slug, observationsWritten: written });
  }

  return out;
}

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

/** Run `worker` over `items` with at most `limit` in flight. */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      const item = items[i];
      if (item === undefined) return;
      results[i] = await worker(item);
    }
  });

  await Promise.all(runners);
  return results;
}

export interface SyncAllOptions extends Omit<SyncSeriesOptions, "full"> {
  slugs?: string[] | null;
  full?: boolean;
  triggeredBy?: string;
  concurrency?: number;
}

export async function syncAll(options: SyncAllOptions = {}): Promise<SyncAllResult> {
  const db = options.db ?? defaultPrisma;
  const concurrency = options.concurrency ?? config.SYNC_CONCURRENCY;

  const targets = await db.series.findMany({
    where: {
      source: "FRED",
      ...(options.slugs && options.slugs.length > 0 ? { slug: { in: options.slugs } } : {}),
    },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });

  const run = await db.syncRun.create({
    data: { status: "RUNNING", triggeredBy: options.triggeredBy ?? "cli" },
    select: { id: true },
  });

  const errors: SyncError[] = [];
  const results = await pool(targets, concurrency, async ({ slug }) => {
    try {
      return await syncSeries(slug, { ...options, db });
    } catch (error) {
      const code =
        error instanceof FredBadSeriesError
          ? "FRED_BAD_SERIES"
          : ((error as { code?: string }).code ?? "SYNC_FAILED");
      errors.push({ slug, code, message: (error as Error).message });
      logger.error("sync.series_failed", { slug, error });
      return {
        slug,
        skipped: true,
        updated: false,
        observationsWritten: 0,
        reason: code,
      } satisfies SyncSeriesResult;
    }
  });

  // Constructed series depend on FRED series, so they come last.
  try {
    const recomputed = await recomputeConstructedSeries(db);
    for (const r of recomputed) {
      if (r.skipped) logger.warn("sync.constructed_skipped", { slug: r.slug, reason: r.skipped });
    }
  } catch (error) {
    errors.push({
      slug: "(constructed)",
      code: (error as { code?: string }).code ?? "RECOMPUTE_FAILED",
      message: (error as Error).message,
    });
  }

  // Section 11.2: expired sessions are swept here rather than in a second job.
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const seriesUpdated = results.filter((r) => r.updated).length;
  const observationsWritten = results.reduce((sum, r) => sum + r.observationsWritten, 0);
  const status: SyncAllResult["status"] =
    errors.length === 0 ? "SUCCESS" : errors.length >= targets.length && targets.length > 0 ? "FAILED" : "PARTIAL";

  await db.syncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status,
      seriesAttempted: targets.length,
      seriesUpdated,
      observationsWritten,
      errorsJson: errors as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    syncRunId: run.id,
    status,
    seriesAttempted: targets.length,
    seriesUpdated,
    observationsWritten,
    errors,
    results,
  };
}
