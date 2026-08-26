import type { SeriesData, TransformSpec } from "@/lib/series/types";

/**
 * Section 6.7. Controls are disabled, never hidden, and a disabled control
 * always says why. A student who cannot see that "adjust for inflation" exists
 * learns nothing; a student who sees it greyed out with "Index numbers are
 * already scale free" has just been taught something.
 */

export interface Capability {
  enabled: boolean;
  reason?: string;
}

export interface Capabilities {
  real: Capability;
  perCapita: Capability;
  growth: Capability;
  denominator: Capability;
}

export type ControlName = keyof Capabilities;

const YES: Capability = { enabled: true };
const no = (reason: string): Capability => ({ enabled: false, reason });

export interface CapabilityContext {
  /** Empty after filtering means there is nothing to be a percent of. */
  denominatorCount?: number;
  /**
   * Set when the chosen deflator has no fully covered year inside the plotted
   * range, which makes "adjust for inflation" unanswerable.
   */
  deflatorHasNoValidBaseYear?: boolean;
}

function realCapability(series: SeriesData): Capability {
  switch (series.kind) {
    case "LEVEL_CURRENCY":
      if (series.isRealAlready) {
        return no("Already in chained dollars. Change the base year on the source series instead.");
      }
      return series.isNominal ? YES : no("Not a nominal monetary series");
    case "LEVEL_COUNT":
      return no("Not a monetary series");
    case "INDEX":
      return no("Index numbers are already scale free");
    case "RATE_PERCENT":
      return no("A rate is already free of the price level");
    case "RATIO":
      return no("A ratio is already scale free");
    case "FLAG":
      return no("A 0 or 1 indicator cannot be transformed");
  }
}

function perCapitaCapability(series: SeriesData, spec: TransformSpec): Capability {
  if (spec.percentOfSlug) return no("Population cancels in a ratio");
  if (series.flags?.isPopulation) {
    return no("This is a population series, so it is the denominator");
  }

  switch (series.kind) {
    case "LEVEL_CURRENCY":
    case "LEVEL_COUNT":
      // A price or a per-worker figure is a level but not an aggregate, so the
      // catalog can still rule it out.
      return series.flags?.canPerCapita === false
        ? no("Not an aggregate, so a per-person figure has no meaning")
        : YES;
    case "INDEX":
      return no("Index numbers are already scale free");
    case "RATE_PERCENT":
      return no("A rate is already a per-person measure of sorts; dividing again means nothing");
    case "RATIO":
      return no("A ratio is already scale free");
    case "FLAG":
      return no("A 0 or 1 indicator cannot be transformed");
  }
}

function growthCapability(series: SeriesData): Capability {
  if (series.kind === "FLAG") return no("A 0 or 1 indicator cannot be transformed");
  if (series.flags?.canGrowth === false) {
    return no("This series crosses zero, so a percent change has no stable meaning");
  }
  return YES;
}

function denominatorCapability(series: SeriesData): Capability {
  if (series.kind === "RATE_PERCENT") return no("A rate cannot be a denominator");
  if (series.kind === "FLAG") return no("A 0 or 1 indicator cannot be a denominator");
  if (series.flags?.canBeDenominator === false) return no("This series cannot be a denominator");
  return YES;
}

export function capabilitiesFor(
  series: SeriesData,
  spec: TransformSpec,
  context: CapabilityContext = {},
): Capabilities {
  // The matrix decides first, so its specific wording survives; the catalog
  // flags can then only narrow what the matrix allowed.
  const byKind = realCapability(series);
  const real =
    byKind.enabled && series.flags?.canReal === false
      ? no("This series is not adjusted for inflation")
      : byKind;

  return {
    real:
      real.enabled && context.deflatorHasNoValidBaseYear
        ? no("No year in this range is fully covered by the deflator")
        : real,
    perCapita: perCapitaCapability(series, spec),
    growth: growthCapability(series),
    denominator:
      context.denominatorCount === 0
        ? no("No series in the catalog can be a denominator for this one")
        : denominatorCapability(series),
  };
}

/** The `disabledReasons` map `GET /api/v1/series/:slug` returns (Section 10.4). */
export function disabledReasons(caps: Capabilities): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, cap] of Object.entries(caps)) {
    if (!cap.enabled && cap.reason) out[name] = cap.reason;
  }
  return out;
}
