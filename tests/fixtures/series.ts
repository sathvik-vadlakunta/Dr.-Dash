import type { Aggregation, Frequency, SeriesData, SeriesKind } from "@/lib/series/types";

/**
 * Section 22.2. Deterministic fixtures. The numbers in `tests/unit/*.test.ts`
 * are pinned to these, so changing a value here changes the contract.
 */

export function mk(
  slug: string,
  frequency: Frequency,
  kind: SeriesKind,
  unitMultiplier: number,
  rows: Array<[string, number | null]>,
  overrides: Partial<SeriesData> = {},
): SeriesData {
  const isCurrency = kind === "LEVEL_CURRENCY";
  return {
    slug,
    shortLabel: slug,
    frequency,
    kind,
    units: isCurrency ? "Billions of Dollars" : "Units",
    unitsShort: isCurrency ? "Bil. $" : "Units",
    unitMultiplier,
    aggregation: "AVG" as Aggregation,
    isNominal: isCurrency,
    isRealAlready: false,
    points: rows.map(([date, value]) => ({ date, value })),
    ...overrides,
  };
}

// Quarterly nominal level, 2019Q1..2020Q4, unitMultiplier 1e9
export const Q_LEVEL = mk("TESTQ", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
  ["2019-01-01", 100],
  ["2019-04-01", 102],
  ["2019-07-01", 104],
  ["2019-10-01", 106],
  ["2020-01-01", 110],
  ["2020-04-01", 113],
  ["2020-07-01", 116],
  ["2020-10-01", 119],
]);

// Monthly deflator, 2019-01..2020-01: 100,101,...,111 then 112
export const M_DEFLATOR = mk("TESTD", "MONTHLY", "INDEX", 1, [
  ["2019-01-01", 100],
  ["2019-02-01", 101],
  ["2019-03-01", 102],
  ["2019-04-01", 103],
  ["2019-05-01", 104],
  ["2019-06-01", 105],
  ["2019-07-01", 106],
  ["2019-08-01", 107],
  ["2019-09-01", 108],
  ["2019-10-01", 109],
  ["2019-11-01", 110],
  ["2019-12-01", 111],
  ["2020-01-01", 112],
]);

// Monthly nominal, 2020-01 only relevant value 200
export const M_NOMINAL = mk("TESTN", "MONTHLY", "LEVEL_CURRENCY", 1e9, [
  ["2019-01-01", 180],
  ["2020-01-01", 200],
]);

// Rate series
export const M_RATE = mk("TESTR", "MONTHLY", "RATE_PERCENT", 1, [
  ["2019-04-01", 3.6],
  ["2020-04-01", 14.7],
]);

// ---------------------------------------------------------------------------
// Pipeline fixture (Section 22.1, transform-pipeline.test.ts): quarterly
// X = [100,100,100,100,110] with a deflator that rises exactly as X does and a
// flat population, so a real per capita growth rate comes out exactly zero.
// ---------------------------------------------------------------------------

const PIPELINE_DATES = ["2019-01-01", "2019-04-01", "2019-07-01", "2019-10-01", "2020-01-01"];

export const P_X = mk(
  "PX",
  "QUARTERLY",
  "LEVEL_CURRENCY",
  1e9,
  PIPELINE_DATES.map((d, i) => [d, i === 4 ? 110 : 100] as [string, number]),
);

export const P_D = mk(
  "PD",
  "QUARTERLY",
  "INDEX",
  1,
  PIPELINE_DATES.map((d, i) => [d, i === 4 ? 110 : 100] as [string, number]),
);

/** Population in thousands, so base units are persons. */
export const P_P = mk(
  "PP",
  "QUARTERLY",
  "LEVEL_COUNT",
  1e3,
  PIPELINE_DATES.map((d) => [d, 1000] as [string, number]),
  {
    isNominal: false,
    units: "Thousands",
    unitsShort: "Thousands",
    flags: { isPopulation: true },
  },
);

/** A loader over a fixed set of fixtures, for the engine's `loader` callback. */
export function fixtureLoader(...series: SeriesData[]) {
  const bySlug = new Map(series.map((s) => [s.slug, s]));
  return async (slug: string): Promise<SeriesData> => {
    const found = bySlug.get(slug);
    if (!found) throw new Error(`fixtureLoader: no fixture for ${slug}`);
    return found;
  };
}
