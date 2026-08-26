import type { Frequency, GrowthMode, TransformResult, ValueKind } from "@/lib/series/types";

/**
 * Section 13. The formatter is the only place a base-unit value is scaled back
 * down for display, and the only place a number is rounded. The engine itself
 * never rounds.
 */

export interface Formattable {
  valueKind: ValueKind;
  displayScale: number;
}

export interface FormatOptions {
  /**
   * Section 13.2: a currency level gets a leading `$` only when
   * `displayScale === 1`, that is, per capita dollars. Otherwise the dollar
   * sign lives in the axis label, which is the statistical-release convention.
   */
  currency?: boolean;
}

const GROUPED = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function grouped(value: number, decimals: number): string {
  if (decimals === 0) return GROUPED.format(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Section 13.2's thresholds, with one qualification. A level that has already
 * been divided by a scale (billions, millions) keeps at least one decimal:
 * "21,433.2" is how a release prints billions of dollars, and Section 13.1's
 * own worked example says so. Once `displayScale` is 1 the thresholds apply
 * unmodified, which is what makes per capita dollars print as "$63,636".
 */
function levelDecimals(scaled: number, displayScale: number): number {
  const abs = Math.abs(scaled);
  const byMagnitude = abs < 10 ? 2 : abs < 1000 ? 1 : 0;
  return displayScale > 1 ? Math.max(1, byMagnitude) : byMagnitude;
}

export function formatValue(
  value: number | null,
  r: Formattable,
  options: FormatOptions = {},
): string {
  if (value === null || !Number.isFinite(value)) return "n/a";

  const scaled = value / (r.displayScale || 1);

  // Section 13.2 attaches thousands grouping to levels; a percent, a
  // percentage-point change, and an index all read as plain decimals.
  switch (r.valueKind) {
    case "PERCENT":
      return `${scaled.toFixed(1)}%`;
    case "PERCENTAGE_POINTS": {
      const sign = scaled < 0 ? "-" : "+";
      return `${sign}${Math.abs(scaled).toFixed(1)} pp`;
    }
    case "INDEX":
      return scaled.toFixed(1);
    case "LEVEL": {
      const decimals = levelDecimals(scaled, r.displayScale);
      const body = grouped(scaled, decimals);
      return options.currency && r.displayScale === 1 ? `$${body}` : body;
    }
  }
}

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Section 13.2: axis ticks go compact above ten thousand, for levels only. */
export function axisTick(value: number | null, r: Formattable, options: FormatOptions = {}): string {
  if (value === null || !Number.isFinite(value)) return "";
  const scaled = value / (r.displayScale || 1);
  if (r.valueKind === "LEVEL" && Math.abs(scaled) >= 10_000) {
    const body = COMPACT.format(scaled);
    return options.currency && r.displayScale === 1 ? `$${body}` : body;
  }
  return formatValue(value, r, options);
}

// ---------------------------------------------------------------------------
// Section 13.3, legend and axis labels
// ---------------------------------------------------------------------------

export interface LabelParts {
  real: boolean;
  baseYear: number | null;
  perCapita: boolean;
  percentOfLabel: string | null;
  growth: GrowthMode;
  growthIsPercentagePoints: boolean;
}

export const LEGEND_LABEL_MAX = 52;

export function legendLabel(shortLabel: string, parts: LabelParts): string {
  const suffixes: string[] = [];

  if (parts.real && parts.baseYear !== null) suffixes.push(`real (${parts.baseYear}$)`);
  if (parts.perCapita) suffixes.push("per capita");
  if (parts.percentOfLabel) suffixes.push(`% of ${parts.percentOfLabel}`);

  if (parts.growth !== "NONE") {
    if (parts.growthIsPercentagePoints) {
      suffixes.push(parts.growth === "YOY" ? "YoY chg (pp)" : "chg (pp)");
    } else if (parts.growth === "YOY") {
      suffixes.push("YoY %");
    } else if (parts.growth === "POP") {
      suffixes.push("% chg");
    } else {
      suffixes.push("% chg (ann.)");
    }
  }

  return [shortLabel, ...suffixes].join(", ");
}

/** The legend chip truncates; the tooltip carries the full text. */
export function truncateLabel(label: string, max = LEGEND_LABEL_MAX): string {
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Section 13.3. An axis takes its label from the first series assigned to it;
 * two different units sharing one axis is a reading error, so the axis says so.
 */
export const MIXED_UNITS = "Mixed units";

export function axisLabel(unitsShort: string[]): string {
  const distinct = [...new Set(unitsShort.filter((u) => u.length > 0))];
  if (distinct.length === 0) return "";
  if (distinct.length === 1) return distinct[0] ?? "";
  return MIXED_UNITS;
}

// ---------------------------------------------------------------------------
// Section 13.4, dates
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatPeriod(date: string, frequency: Frequency): string {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const monthName = MONTHS[month - 1] ?? "";

  switch (frequency) {
    case "ANNUAL":
      return year;
    case "QUARTERLY":
      return `${year} Q${Math.floor((month - 1) / 3) + 1}`;
    case "MONTHLY":
      return `${monthName} ${year}`;
    case "WEEKLY":
      return `Week of ${monthName} ${day}, ${year}`;
    case "DAILY":
      return `${monthName} ${day}, ${year}`;
  }
}

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50];
const MAX_TICKS = 12;

/** Section 13.4: year ticks only, at most twelve of them. */
export function yearTickStep(minYear: number, maxYear: number): number {
  const span = Math.max(0, maxYear - minYear);
  for (const step of YEAR_STEPS) {
    if (Math.floor(span / step) + 1 <= MAX_TICKS) return step;
  }
  return YEAR_STEPS[YEAR_STEPS.length - 1] ?? 50;
}

// ---------------------------------------------------------------------------
// Unit-scale wording, shared by the real transform and the axis labels
// ---------------------------------------------------------------------------

export interface ScaleWords {
  long: string;
  short: string;
}

export function scaleWords(unitMultiplier: number): ScaleWords {
  switch (unitMultiplier) {
    case 1e12:
      return { long: "Trillions of", short: "Tril." };
    case 1e9:
      return { long: "Billions of", short: "Bil." };
    case 1e6:
      return { long: "Millions of", short: "Mil." };
    case 1e3:
      return { long: "Thousands of", short: "Thous." };
    default:
      return { long: "", short: "" };
  }
}

/** "Thousands of Units" -> "Units"; "Billions of Dollars" -> "Dollars". */
export function unitNoun(units: string): string {
  const stripped = units.replace(/^(trillions|billions|millions|thousands)\s+of\s+/i, "").trim();
  return stripped.length > 0 ? stripped : units;
}

export function displayScaleFor(
  r: Pick<TransformResult, "valueKind">,
  unitMultiplier: number,
  perCapita: boolean,
): number {
  if (r.valueKind !== "LEVEL") return 1;
  return perCapita ? 1 : unitMultiplier;
}
