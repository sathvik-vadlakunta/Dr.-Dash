import { byDate } from "@/lib/series/align";
import {
  TransformError,
  type Point,
  type SeriesData,
  type ValueKind,
} from "@/lib/series/types";

/**
 * Section 6.5.4. A ratio shows relative size. The question it answers is
 * whether a share rose or fell, which is not the same question as whether the
 * level rose or fell, and the two answers routinely disagree.
 */

export interface PercentOfResult {
  series: SeriesData;
  units: string;
  unitsShort: string;
  valueKind: ValueKind;
  displayScale: number;
  formulaStep: string;
  warnings: string[];
}

const SIGN_WARNING = "Denominator changes sign; ratio may be misleading.";

/** Section 6.5.4 rule 2: a rate or a flag can never be a denominator. */
export function assertUsableDenominator(denominator: SeriesData): void {
  if (denominator.kind === "RATE_PERCENT" || denominator.kind === "FLAG") {
    throw new TransformError(
      "DENOMINATOR_NOT_COMPARABLE",
      `${denominator.slug} cannot be a denominator because it is a ${
        denominator.kind === "FLAG" ? "0 or 1 indicator" : "rate"
      }.`,
      { slug: denominator.slug, kind: denominator.kind },
    );
  }
}

/** Whether the denominator can be put in the same real space as a deflated numerator. */
export function isDeflatable(series: SeriesData): boolean {
  return series.kind === "LEVEL_CURRENCY";
}

/**
 * Both series must already be at the same frequency and both are converted to
 * base units before dividing, so a billions-scaled numerator over a
 * millions-scaled denominator still gives the right share.
 */
export function applyPercentOf(
  numerator: SeriesData,
  denominator: SeriesData,
): PercentOfResult {
  assertUsableDenominator(denominator);

  const denominatorValues = byDate(denominator);
  const warnings: string[] = [];

  const points: Point[] = numerator.points.map((p) => {
    const raw = denominatorValues.get(p.date);
    if (p.value === null || raw === undefined || raw === null) {
      return { date: p.date, value: null };
    }
    if (raw < 0 && !warnings.includes(SIGN_WARNING)) warnings.push(SIGN_WARNING);

    const m = raw * denominator.unitMultiplier;
    // Section 6.5.4 step 3: a zero denominator yields null, never Infinity.
    if (m === 0) return { date: p.date, value: null };

    return { date: p.date, value: ((p.value * numerator.unitMultiplier) / m) * 100 };
  });

  const units = `Percent of ${denominator.shortLabel}`;
  const unitsShort = `% of ${denominator.shortLabel}`;

  return {
    series: { ...numerator, points, units, unitsShort, unitMultiplier: 1 },
    units,
    unitsShort,
    valueKind: "PERCENT",
    displayScale: 1,
    formulaStep: `/ ${denominator.slug}(t) x 100`,
    warnings,
  };
}
