import { byDate } from "@/lib/series/align";
import { unitNoun } from "@/lib/series/format";
import {
  TransformError,
  type Point,
  type SeriesData,
  type ValueKind,
} from "@/lib/series/types";

/**
 * Section 6.5.3. Dividing an aggregate by population turns it into a
 * per-person figure, which is what living standards actually depend on. An
 * economy can grow simply by adding people.
 */

export interface PerCapitaResult {
  series: SeriesData;
  units: string;
  unitsShort: string;
  valueKind: ValueKind;
  displayScale: number;
  formulaStep: string;
  warnings: string[];
}

export interface PerCapitaOptions {
  /** Set when a real transform already ran, so the label keeps its base year. */
  baseYear?: number | null;
}

/**
 * Both series must already be at the same frequency. Values are converted to
 * base units here (Section 6.2) because this is the first step that combines
 * two series measured on different scales.
 */
export function applyPerCapita(
  series: SeriesData,
  population: SeriesData,
  options: PerCapitaOptions = {},
): PerCapitaResult {
  if (series.kind !== "LEVEL_CURRENCY" && series.kind !== "LEVEL_COUNT") {
    throw new TransformError(
      "TRANSFORM_NOT_ALLOWED",
      `${series.shortLabel} is not an aggregate, so dividing it by population is not meaningful.`,
      { slug: series.slug, kind: series.kind },
    );
  }

  const populationValues = byDate(population);

  const points: Point[] = series.points.map((p) => {
    const pop = populationValues.get(p.date);
    if (p.value === null || pop === undefined || pop === null) {
      return { date: p.date, value: null };
    }
    const persons = pop * population.unitMultiplier;
    if (persons === 0) return { date: p.date, value: null };
    return { date: p.date, value: (p.value * series.unitMultiplier) / persons };
  });

  const base = options.baseYear ?? null;
  const isCurrency = series.kind === "LEVEL_CURRENCY";

  const units = isCurrency
    ? base !== null
      ? `${base} Dollars per person`
      : "Dollars per person"
    : `${unitNoun(series.units)} per person`;

  const unitsShort = isCurrency
    ? base !== null
      ? `${base} $/person`
      : "$/person"
    : `${unitNoun(series.unitsShort)}/person`;

  return {
    // The result is in base units per person, so the formatter must not scale
    // it again: displayScale is 1 from here on.
    series: { ...series, points, units, unitsShort, unitMultiplier: 1 },
    units,
    unitsShort,
    valueKind: "LEVEL",
    displayScale: 1,
    formulaStep: `/ ${population.slug}(t)`,
    warnings: [],
  };
}
