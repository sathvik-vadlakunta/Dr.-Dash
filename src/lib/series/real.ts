import { byDate, yearOf } from "@/lib/series/align";
import { scaleWords } from "@/lib/series/format";
import {
  TransformError,
  type Frequency,
  type Point,
  type SeriesData,
  type ValueKind,
} from "@/lib/series/types";

/**
 * Section 6.5.2. Inflation changes what a dollar buys, so a real series values
 * every period at one year's prices. The base year is the user's choice and
 * changing it rescales the whole line by a constant, which is exactly why it
 * changes the level and leaves the growth rate alone.
 */

export interface RealResult {
  series: SeriesData;
  units: string;
  unitsShort: string;
  valueKind: ValueKind;
  formulaStep: string;
  warnings: string[];
  baseYearMean: number;
}

/** A year is only usable as a base if the deflator covers all of it. */
const REQUIRED_COVERAGE: Record<Frequency, number> = {
  ANNUAL: 1,
  QUARTERLY: 4,
  MONTHLY: 12,
  WEEKLY: 52,
  DAILY: 1,
};

function coverage(deflator: SeriesData): Map<number, number[]> {
  const byYear = new Map<number, number[]>();
  for (const p of deflator.points) {
    if (p.value === null) continue;
    const year = yearOf(p.date);
    const list = byYear.get(year);
    if (list) list.push(p.value);
    else byYear.set(year, [p.value]);
  }
  return byYear;
}

/** Section 6.5.2 step 5: every year the deflator fully covers, ascending. */
export function validBaseYears(deflator: SeriesData): number[] {
  const required = REQUIRED_COVERAGE[deflator.frequency];
  return [...coverage(deflator).entries()]
    .filter(([, values]) => values.length >= required)
    .map(([year]) => year)
    .sort((a, b) => a - b);
}

/** Section 6.5.2 step 2. Throws `BASE_YEAR_INCOMPLETE` on a partly covered year. */
export function baseYearMean(deflator: SeriesData, baseYear: number): number {
  const values = coverage(deflator).get(baseYear) ?? [];
  const required = REQUIRED_COVERAGE[deflator.frequency];

  if (values.length < required) {
    const valid = validBaseYears(deflator);
    throw new TransformError(
      "BASE_YEAR_INCOMPLETE",
      `${baseYear} is not fully covered by ${deflator.shortLabel}. ` +
        (valid.length > 0
          ? `Pick a year between ${valid[0]} and ${valid[valid.length - 1]}.`
          : `${deflator.shortLabel} has no fully covered year.`),
      {
        baseYear,
        deflatorSlug: deflator.slug,
        deflatorLabel: deflator.shortLabel,
        validBaseYears: valid,
        found: values.length,
        required,
      },
    );
  }

  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * `series` and `deflator` must already be at the same frequency; the pipeline
 * aligns them before calling.
 *
 * Like every other operator, the result is in base units (Section 6.2) and
 * carries `unitMultiplier: 1`, so running two operators in sequence never
 * scales the same value twice.
 */
export interface RealOptions {
  /**
   * The series' original stored scale. The pipeline hands this operator values
   * already in base units (`unitMultiplier: 1`), but the axis still reads
   * "Billions of 2017 Dollars", so the wording comes from the original scale
   * rather than from whatever the value currently carries.
   */
  scaleMultiplier?: number;
}

export function applyReal(
  series: SeriesData,
  deflator: SeriesData,
  baseYear: number,
  options: RealOptions = {},
): RealResult {
  const mean = baseYearMean(deflator, baseYear);
  const deflatorValues = byDate(deflator);

  const points: Point[] = series.points.map((p) => {
    const d = deflatorValues.get(p.date);
    if (p.value === null || d === undefined || d === null || d === 0) {
      return { date: p.date, value: null };
    }
    return { date: p.date, value: p.value * series.unitMultiplier * (mean / d) };
  });

  const words = scaleWords(options.scaleMultiplier ?? series.unitMultiplier);
  const units = words.long ? `${words.long} ${baseYear} Dollars` : `${baseYear} Dollars`;
  const unitsShort = words.short ? `${words.short} ${baseYear} $` : `${baseYear} $`;

  return {
    series: {
      ...series,
      points,
      units,
      unitsShort,
      unitMultiplier: 1,
      isNominal: false,
      isRealAlready: true,
    },
    units,
    unitsShort,
    valueKind: "LEVEL",
    formulaStep: `x ${deflator.slug}(${baseYear})/${deflator.slug}(t)`,
    warnings: [],
    baseYearMean: mean,
  };
}
