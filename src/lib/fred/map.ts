import type { FredSeriesMeta } from "@/lib/fred/client";
import type { Frequency, SeriesKind } from "@/lib/series/types";

/**
 * Section 9.6. FRED metadata to `Series` fields. Nothing here writes to the
 * database: the admin approval screen shows every mapped field in editable
 * inputs and an admin confirms before anything is created.
 */

export class UnsupportedFrequencyError extends Error {
  readonly code = "UNSUPPORTED_FREQUENCY";
  constructor(frequencyShort: string) {
    super(`Dr. Dash does not support the FRED frequency "${frequencyShort}".`);
    this.name = "UnsupportedFrequencyError";
  }
}

export function mapFrequency(frequencyShort: string): Frequency {
  switch (frequencyShort.trim().toUpperCase()) {
    case "D":
      return "DAILY";
    case "W":
      return "WEEKLY";
    case "M":
      return "MONTHLY";
    case "Q":
      return "QUARTERLY";
    case "A":
      return "ANNUAL";
    default:
      // "SA" is semiannual, which the alignment rules of Section 6.3 have no
      // periods-per-year entry for.
      throw new UnsupportedFrequencyError(frequencyShort);
  }
}

export function mapUnitMultiplier(units: string): number {
  const leading = units.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (leading) {
    case "trillions":
      return 1e12;
    case "billions":
      return 1e9;
    case "millions":
      return 1e6;
    case "thousands":
      return 1e3;
    default:
      return 1;
  }
}

export function mapKind(units: string): SeriesKind {
  const u = units.trim();
  if (/rate of change/i.test(u)) {
    // "Percent Rate of Change" is a growth rate, not a level rate.
    return "RATE_PERCENT";
  }
  if (/percent|rate/i.test(u)) return "RATE_PERCENT";
  if (/^index/i.test(u)) return "INDEX";
  if (/dollars/i.test(u)) return "LEVEL_CURRENCY";
  if (/persons|units|number/i.test(u)) return "LEVEL_COUNT";
  return "RATIO";
}

export function mapSeasonalAdjustment(short: string): "SA" | "NSA" | "SAAR" {
  const s = short.trim().toUpperCase();
  if (s === "SAAR") return "SAAR";
  if (s === "SA") return "SA";
  return "NSA";
}

/** Truncate to 28 characters at a word boundary (Section 9.6). */
export function toShortLabel(title: string, max = 28): string {
  const clean = title.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

export interface MappedSeriesFields {
  slug: string;
  fredId: string;
  title: string;
  shortLabel: string;
  description: string;
  units: string;
  unitsShort: string;
  unitMultiplier: number;
  frequency: Frequency;
  seasonalAdjustment: "SA" | "NSA" | "SAAR";
  kind: SeriesKind;
  isNominal: boolean;
  isRealAlready: boolean;
  canReal: boolean;
  canPerCapita: boolean;
  canGrowth: boolean;
  canBeDenominator: boolean;
  sourceName: string;
  sourceUrl: string;
  observationStart: string;
  observationEnd: string;
  fredLastUpdated: string;
  popularity: number;
}

export function mapFredSeries(meta: FredSeriesMeta): MappedSeriesFields {
  const frequency = mapFrequency(meta.frequency_short);
  const kind = mapKind(meta.units);
  const isReal = /chained|real/i.test(meta.title);
  const isNominal = kind === "LEVEL_CURRENCY" && !isReal;
  const isRealAlready = kind === "LEVEL_CURRENCY" && isReal;

  return {
    slug: meta.id,
    fredId: meta.id,
    title: meta.title,
    shortLabel: toShortLabel(meta.title),
    description: meta.notes?.trim() || meta.title,
    units: meta.units,
    unitsShort: meta.units_short || meta.units,
    unitMultiplier: mapUnitMultiplier(meta.units),
    frequency,
    seasonalAdjustment: mapSeasonalAdjustment(meta.seasonal_adjustment_short),
    kind,
    isNominal,
    isRealAlready,
    canReal: isNominal,
    // An admin picks the population series on the approval screen; until one is
    // chosen, invariant 4 (canPerCapita requires a defaultPopulation) forbids it.
    canPerCapita: false,
    canGrowth: kind !== "FLAG",
    canBeDenominator: kind !== "RATE_PERCENT" && kind !== "FLAG",
    sourceName: "FRED",
    sourceUrl: `https://fred.stlouisfed.org/series/${meta.id}`,
    observationStart: meta.observation_start,
    observationEnd: meta.observation_end,
    fredLastUpdated: meta.last_updated,
    popularity: meta.popularity ?? 0,
  };
}
