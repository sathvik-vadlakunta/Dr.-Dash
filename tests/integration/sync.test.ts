import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FredObservation, FredSeriesMeta } from "@/lib/fred/client";
import { recomputeConstructedSeries, syncAll, syncSeries } from "@/lib/fred/sync";
import { createTestSchema, seedCatalog, type TestDatabase } from "./harness";

/**
 * Section 22.2, integration test 4. The FRED client is stubbed, so this asserts
 * the ingestion logic itself: upsert counts, the unchanged-metadata skip, and
 * that constructed series recompute in topological order.
 */

const LAST_UPDATED = "2026-08-01T12:00:00-05:00";

/** Deterministic stub data for the handful of series this test touches. */
const STUB: Record<string, { frequency: string; units: string; obs: Array<[string, string]> }> = {
  CPIAUCSL: {
    frequency: "M",
    units: "Index 1982-1984=100",
    obs: [
      ["2023-01-01", "300.0"],
      ["2023-02-01", "301.0"],
      ["2024-01-01", "315.0"],
      ["2024-02-01", "316.0"],
    ],
  },
  UNRATE: {
    frequency: "M",
    units: "Percent",
    obs: [
      ["2023-01-01", "3.4"],
      ["2023-02-01", "3.6"],
      ["2024-01-01", "3.7"],
      ["2024-02-01", "."],
    ],
  },
  FEDFUNDS: {
    frequency: "M",
    units: "Percent",
    obs: [
      ["2023-01-01", "4.33"],
      ["2023-02-01", "4.57"],
      ["2024-01-01", "5.33"],
      ["2024-02-01", "5.33"],
    ],
  },
};

let metaCalls = 0;
let observationCalls: string[] = [];

function makeMeta(seriesId: string, lastUpdated = LAST_UPDATED): FredSeriesMeta {
  const stub = STUB[seriesId];
  if (!stub) throw new Error(`No stub for ${seriesId}`);
  return {
    id: seriesId,
    title: seriesId,
    observation_start: stub.obs[0]?.[0] ?? "2023-01-01",
    observation_end: stub.obs.at(-1)?.[0] ?? "2024-02-01",
    frequency: stub.frequency,
    frequency_short: stub.frequency,
    units: stub.units,
    units_short: stub.units,
    seasonal_adjustment: "Seasonally Adjusted",
    seasonal_adjustment_short: "SA",
    last_updated: lastUpdated,
  };
}

function stubbedClient(lastUpdated = LAST_UPDATED) {
  return {
    fetchMeta: async (seriesId: string) => {
      metaCalls += 1;
      return makeMeta(seriesId, lastUpdated);
    },
    fetchObservations: async (seriesId: string): Promise<FredObservation[]> => {
      observationCalls.push(seriesId);
      return (STUB[seriesId]?.obs ?? []).map(([date, value]) => ({ date, value }));
    },
  };
}

describe("FRED ingestion", () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createTestSchema("sync");
    prisma = db.prisma;
    await seedCatalog(prisma);
  });

  afterAll(async () => {
    await db.drop();
  });

  it("writes observations, skipping the string '.' rather than storing zero", async () => {
    metaCalls = 0;
    observationCalls = [];

    const result = await syncSeries("CPIAUCSL", { db: prisma, ...stubbedClient() });

    expect(result.updated).toBe(true);
    expect(result.observationsWritten).toBe(4);

    const series = await prisma.series.findUniqueOrThrow({ where: { slug: "CPIAUCSL" } });
    expect(series.observationStart?.toISOString().slice(0, 10)).toBe("2023-01-01");
    expect(series.observationEnd?.toISOString().slice(0, 10)).toBe("2024-02-01");
    expect(series.fredLastUpdated).not.toBeNull();

    const unrate = await syncSeries("UNRATE", { db: prisma, ...stubbedClient() });
    expect(unrate.observationsWritten).toBe(4);

    const missing = await prisma.observation.findFirstOrThrow({
      where: { series: { slug: "UNRATE" }, date: new Date("2024-02-01T00:00:00Z") },
    });
    // Rule 0.1.8: a missing value is null, never 0.
    expect(missing.value).toBeNull();
  });

  it("skips a series whose FRED last_updated has not moved", async () => {
    observationCalls = [];
    metaCalls = 0;

    const second = await syncSeries("CPIAUCSL", { db: prisma, ...stubbedClient() });

    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("UNCHANGED");
    expect(second.observationsWritten).toBe(0);
    // The skip is decided from FRED's own metadata, so the cheap request still
    // happens; the expensive one does not.
    expect(metaCalls).toBe(1);
    expect(observationCalls).toEqual([]);
  });

  it("re-fetches when FRED reports a newer last_updated", async () => {
    observationCalls = [];

    const third = await syncSeries("CPIAUCSL", {
      db: prisma,
      ...stubbedClient("2026-08-20T12:00:00-05:00"),
    });

    expect(third.updated).toBe(true);
    expect(observationCalls).toEqual(["CPIAUCSL"]);
  });

  it("upserts rather than duplicating on re-sync", async () => {
    const count = await prisma.observation.count({ where: { series: { slug: "CPIAUCSL" } } });
    expect(count).toBe(4);
  });

  it("recomputes constructed series in topological order", async () => {
    await syncSeries("FEDFUNDS", { db: prisma, ...stubbedClient() });

    const results = await recomputeConstructedSeries(prisma);
    const order = results.map((r) => r.slug);

    // DD_MISERY and DD_REAL_FFR both read DD_INFL_CPI, so it has to come first.
    expect(order.indexOf("DD_INFL_CPI")).toBeLessThan(order.indexOf("DD_MISERY"));
    expect(order.indexOf("DD_INFL_CPI")).toBeLessThan(order.indexOf("DD_REAL_FFR"));

    // 2024-01 inflation = 315/300 - 1 = 5%.
    const infl = await prisma.observation.findFirstOrThrow({
      where: { series: { slug: "DD_INFL_CPI" }, date: new Date("2024-01-01T00:00:00Z") },
    });
    expect(infl.value).toBeCloseTo(5, 6);

    // Misery = unemployment 3.7 + inflation 5 = 8.7.
    const misery = await prisma.observation.findFirstOrThrow({
      where: { series: { slug: "DD_MISERY" }, date: new Date("2024-01-01T00:00:00Z") },
    });
    expect(misery.value).toBeCloseTo(8.7, 6);

    // Real fed funds = 5.33 - 5 = 0.33.
    const real = await prisma.observation.findFirstOrThrow({
      where: { series: { slug: "DD_REAL_FFR" }, date: new Date("2024-01-01T00:00:00Z") },
    });
    expect(real.value).toBeCloseTo(0.33, 6);
  });

  it("records a SyncRun with per-series errors and a status", async () => {
    const failing = {
      fetchMeta: async (seriesId: string) => {
        if (seriesId === "UNRATE") throw new Error("upstream exploded");
        return makeMeta(seriesId, "2026-08-24T12:00:00-05:00");
      },
      fetchObservations: stubbedClient().fetchObservations,
    };

    const result = await syncAll({
      db: prisma,
      slugs: ["CPIAUCSL", "UNRATE"],
      triggeredBy: "test",
      concurrency: 2,
      ...failing,
    });

    expect(result.seriesAttempted).toBe(2);
    expect(result.status).toBe("PARTIAL");
    expect(result.errors.map((e) => e.slug)).toEqual(["UNRATE"]);

    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: result.syncRunId } });
    expect(run.status).toBe("PARTIAL");
    expect(run.finishedAt).not.toBeNull();
    expect(run.triggeredBy).toBe("test");
  });
});
