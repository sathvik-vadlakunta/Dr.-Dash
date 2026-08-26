import { alignTo, coarsestFrequency } from "@/lib/series/align";
import { legendLabel } from "@/lib/series/format";
import { applyGrowth } from "@/lib/series/growth";
import { applyPerCapita } from "@/lib/series/percapita";
import { applyPercentOf, assertUsableDenominator, isDeflatable } from "@/lib/series/percentof";
import { applyReal } from "@/lib/series/real";
import {
  TransformError,
  type Frequency,
  type SeriesData,
  type TransformResult,
  type TransformSpec,
  type ValueKind,
} from "@/lib/series/types";

/**
 * Section 6.6. The pipeline, in fixed order:
 *
 *   1. resolve helper series (deflator, population, denominator)
 *   2. align, only if a helper series is involved
 *   3. real
 *   4. per capita
 *   5. percent of
 *   6. growth  <- ALWAYS LAST
 *
 * Growth is a rate of change, so it must be taken of whatever level the user
 * finally chose to look at. Deflating after taking a growth rate would be
 * wrong: there is nothing left to deflate, and the arithmetic would silently
 * produce a number that means nothing.
 */

export type SeriesLoader = (slug: string) => Promise<SeriesData>;

/**
 * Section 6.2. Everything downstream reasons in base units, so the conversion
 * happens once, here, rather than being re-applied by each operator. The
 * original scale survives as `displayScale`, which is the only thing that ever
 * divides it back down (Section 13.1).
 */
function toBaseUnits(series: SeriesData): SeriesData {
  if (series.unitMultiplier === 1) return series;
  return {
    ...series,
    unitMultiplier: 1,
    points: series.points.map((p) => ({
      date: p.date,
      value: p.value === null ? null : p.value * series.unitMultiplier,
    })),
  };
}

export async function applyTransform(
  base: SeriesData,
  spec: TransformSpec,
  loader: SeriesLoader,
): Promise<TransformResult> {
  const warnings: string[] = [];
  const formulaChain: string[] = [`${base.slug} (${base.units})`];
  const effectiveSpec: TransformSpec = { ...spec };

  // Section 6.5.4 rule 2: population cancels in a ratio, so asking for both is
  // a request for something that does not exist. Drop the one that has no
  // effect and say so, rather than silently computing something else.
  if (effectiveSpec.percentOfSlug !== null && effectiveSpec.perCapita) {
    effectiveSpec.perCapita = false;
    warnings.push("Per capita has no effect on a ratio; it was ignored.");
  }

  // ---- 1. resolve helper series -------------------------------------------

  let deflator: SeriesData | null = null;
  if (effectiveSpec.real) {
    if (effectiveSpec.baseYear === null) {
      throw new TransformError(
        "BASE_YEAR_REQUIRED",
        "Adjusting for inflation needs a base year.",
        { slug: base.slug },
      );
    }
    if (!effectiveSpec.deflatorSlug) {
      throw new TransformError(
        "DEFLATOR_MISSING",
        `${base.shortLabel} has no deflator to adjust it with.`,
        { slug: base.slug },
      );
    }
    deflator = await loader(effectiveSpec.deflatorSlug);
  }

  let population: SeriesData | null = null;
  if (effectiveSpec.perCapita) {
    if (!effectiveSpec.populationSlug) {
      throw new TransformError(
        "POPULATION_MISSING",
        `${base.shortLabel} has no population series to divide by.`,
        { slug: base.slug },
      );
    }
    population = await loader(effectiveSpec.populationSlug);
  }

  let denominator: SeriesData | null = null;
  if (effectiveSpec.percentOfSlug) {
    denominator = await loader(effectiveSpec.percentOfSlug);
    assertUsableDenominator(denominator);
  }

  // ---- 2. align ------------------------------------------------------------

  const helpers = [deflator, population, denominator].filter(
    (s): s is SeriesData => s !== null,
  );

  let frequency: Frequency = base.frequency;
  let current = toBaseUnits(base);

  if (helpers.length > 0) {
    frequency = coarsestFrequency([base, ...helpers]);

    const alignedBase = alignTo(current, frequency);
    warnings.push(...alignedBase.warnings);
    current = alignedBase;

    if (deflator) {
      const aligned = alignTo(deflator, frequency);
      warnings.push(...aligned.warnings);
      deflator = aligned;
    }
    if (population) {
      const aligned = alignTo(population, frequency);
      warnings.push(...aligned.warnings);
      population = aligned;
    }
    if (denominator) {
      const aligned = alignTo(denominator, frequency);
      warnings.push(...aligned.warnings);
      denominator = aligned;
    }
  }

  let valueKind: ValueKind =
    base.kind === "RATE_PERCENT" ? "PERCENT" : base.kind === "INDEX" ? "INDEX" : "LEVEL";
  let units = current.units;
  let unitsShort = current.unitsShort;
  let displayScale = valueKind === "LEVEL" ? base.unitMultiplier : 1;

  // ---- 3. real -------------------------------------------------------------

  if (effectiveSpec.real && deflator && effectiveSpec.baseYear !== null) {
    const real = applyReal(current, deflator, effectiveSpec.baseYear, {
      scaleMultiplier: base.unitMultiplier,
    });
    current = real.series;
    units = real.units;
    unitsShort = real.unitsShort;
    valueKind = real.valueKind;
    formulaChain.push(real.formulaStep);
    warnings.push(...real.warnings);
  }

  // ---- 4. per capita -------------------------------------------------------

  if (effectiveSpec.perCapita && population) {
    const percap = applyPerCapita(current, population, {
      baseYear: effectiveSpec.real ? effectiveSpec.baseYear : null,
    });
    current = percap.series;
    units = percap.units;
    unitsShort = percap.unitsShort;
    valueKind = percap.valueKind;
    displayScale = percap.displayScale;
    formulaChain.push(percap.formulaStep);
    warnings.push(...percap.warnings);
  }

  // ---- 5. percent of -------------------------------------------------------

  if (effectiveSpec.percentOfSlug && denominator) {
    // Section 6.5.4 rule 2: both sides must be in comparable space, so a
    // deflated numerator needs a denominator deflated the same way.
    let comparableDenominator = denominator;
    if (effectiveSpec.real && deflator && effectiveSpec.baseYear !== null) {
      if (!isDeflatable(denominator)) {
        throw new TransformError(
          "DENOMINATOR_NOT_COMPARABLE",
          `${denominator.slug} cannot be a denominator for an inflation-adjusted series because it is not measured in dollars.`,
          { slug: denominator.slug, kind: denominator.kind },
        );
      }
      // A chained-dollar denominator is already in constant dollars; deflating
      // it a second time would be wrong.
      if (!denominator.isRealAlready) {
        comparableDenominator = applyReal(denominator, deflator, effectiveSpec.baseYear).series;
      }
    }

    const ratio = applyPercentOf(current, comparableDenominator);
    current = ratio.series;
    units = ratio.units;
    unitsShort = ratio.unitsShort;
    valueKind = ratio.valueKind;
    displayScale = ratio.displayScale;
    formulaChain.push(ratio.formulaStep);
    warnings.push(...ratio.warnings);
  }

  // ---- 6. growth, always last ---------------------------------------------

  let growthIsPercentagePoints = false;

  if (effectiveSpec.growth !== "NONE") {
    const growth = applyGrowth(current, effectiveSpec.growth, valueKind);
    current = { ...current, points: growth.points };
    units = growth.units;
    unitsShort = growth.unitsShort;
    valueKind = growth.valueKind;
    displayScale = 1;
    growthIsPercentagePoints = growth.valueKind === "PERCENTAGE_POINTS";
    formulaChain.push(growth.formulaStep);
    warnings.push(...growth.warnings);
  }

  const label = legendLabel(base.shortLabel, {
    real: effectiveSpec.real,
    baseYear: effectiveSpec.baseYear,
    perCapita: effectiveSpec.perCapita,
    percentOfLabel: denominator?.shortLabel ?? null,
    growth: effectiveSpec.growth,
    growthIsPercentagePoints,
  });

  return {
    points: current.points,
    units,
    unitsShort,
    valueKind,
    frequency,
    label,
    formulaChain,
    warnings: [...new Set(warnings)],
    displayScale,
    effectiveSpec,
  };
}
