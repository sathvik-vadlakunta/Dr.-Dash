import { PERIODS_PER_YEAR, byDate, yearOf } from "@/lib/series/align";
import type {
  Frequency,
  GrowthMode,
  Point,
  SeriesData,
  ValueKind,
} from "@/lib/series/types";

/**
 * Section 6.5.1. A growth rate answers "how fast", which is a different
 * question from "how big". Two forms exist and picking the wrong one is the
 * classic reading error the lessons are built around:
 *
 *   - a level, an index, or a ratio grows by a *percent change*;
 *   - something already measured in percent changes by a *percentage-point
 *     difference*, because the percent change of a percent is meaningless.
 */

export interface GrowthResult {
  points: Point[];
  valueKind: ValueKind;
  units: string;
  unitsShort: string;
  warnings: string[];
  formulaStep: string;
}

const SIGN_CHANGE_WARNING = "Annualized growth undefined for sign changes.";

/** Section 6.4. The date one year before `date`, per frequency. */
export function yearAgoDate(date: string, freq: Frequency): string {
  switch (freq) {
    case "ANNUAL":
    case "QUARTERLY":
    case "MONTHLY": {
      const y = yearOf(date) - 1;
      return `${String(y).padStart(4, "0")}${date.slice(4)}`;
    }
    case "WEEKLY":
      return shiftDays(date, -364);
    case "DAILY":
      return shiftDays(date, -365);
  }
}

function shiftDays(date: string, days: number): string {
  const y = yearOf(date);
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const parse = (s: string) =>
    Date.UTC(yearOf(s), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((parse(a) - parse(b)) / 86_400_000);
}

/**
 * Find the observation a year back. Monthly, quarterly, and annual series need
 * an exact date match; weekly and daily series match the nearest observation
 * inside a tolerance, because their period starts drift.
 */
function lookbackValue(series: SeriesData, index: number, date: string): number | null {
  const target = yearAgoDate(date, series.frequency);

  if (series.frequency === "WEEKLY") {
    let best: Point | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let i = index - 1; i >= 0; i -= 1) {
      const p = series.points[i];
      if (!p) continue;
      const gap = Math.abs(daysBetween(p.date, target));
      if (gap <= 3 && gap < bestGap) {
        best = p;
        bestGap = gap;
      }
      if (daysBetween(p.date, target) < -3) break;
    }
    return best?.value ?? null;
  }

  if (series.frequency === "DAILY") {
    // Nearest observation at or before the target, within 7 days.
    for (let i = index - 1; i >= 0; i -= 1) {
      const p = series.points[i];
      if (!p) continue;
      const gap = daysBetween(target, p.date);
      if (gap < 0) continue; // still after the target
      return gap <= 7 ? p.value : null;
    }
    return null;
  }

  return byDate(series).get(target) ?? null;
}

function unitsFor(mode: GrowthMode, percentagePoints: boolean): { units: string; unitsShort: string } {
  if (percentagePoints) {
    return mode === "YOY"
      ? { units: "Change from year ago, percentage points", unitsShort: "pp YoY" }
      : { units: "Change from previous period, percentage points", unitsShort: "pp chg" };
  }
  switch (mode) {
    case "YOY":
      return { units: "Percent change from year ago", unitsShort: "% YoY" };
    case "POP":
      return { units: "Percent change from previous period", unitsShort: "% chg" };
    case "POP_ANNUALIZED":
      return { units: "Percent change, annualized", unitsShort: "% chg (ann.)" };
    case "NONE":
      return { units: "", unitsShort: "" };
  }
}

function formulaFor(mode: GrowthMode, percentagePoints: boolean): string {
  if (percentagePoints) {
    return mode === "YOY" ? "YoY change (pp)" : "Period change (pp)";
  }
  switch (mode) {
    case "YOY":
      return "YoY % change";
    case "POP":
      return "Period % change";
    case "POP_ANNUALIZED":
      return "Annualized % change";
    case "NONE":
      return "";
  }
}

/**
 * `incoming` is the value kind of whatever the pipeline produced before this
 * step, so a share of GDP (already a PERCENT) correctly changes in percentage
 * points rather than in percent of a percent.
 */
export function applyGrowth(
  series: SeriesData,
  mode: GrowthMode,
  incoming: ValueKind = series.kind === "RATE_PERCENT" ? "PERCENT" : "LEVEL",
): GrowthResult {
  const percentagePoints =
    series.kind === "RATE_PERCENT" ||
    incoming === "PERCENT" ||
    incoming === "PERCENTAGE_POINTS";

  const warnings: string[] = [];
  const { units, unitsShort } = unitsFor(mode, percentagePoints);

  const points: Point[] = series.points.map((p, i) => {
    if (mode === "NONE") return p;

    const current = p.value;
    const previous =
      mode === "YOY"
        ? lookbackValue(series, i, p.date)
        : // Period over period is the immediately preceding element. A null
          // previous value gives null; it is never skipped over.
          (series.points[i - 1]?.value ?? null);

    if (current === null || previous === null) return { date: p.date, value: null };

    if (percentagePoints) {
      return { date: p.date, value: current - previous };
    }

    if (previous === 0) {
      // Never emit Infinity.
      return { date: p.date, value: null };
    }

    const ratio = current / previous;

    if (mode === "POP_ANNUALIZED") {
      if (ratio < 0) {
        if (!warnings.includes(SIGN_CHANGE_WARNING)) warnings.push(SIGN_CHANGE_WARNING);
        return { date: p.date, value: null };
      }
      const k = PERIODS_PER_YEAR[series.frequency];
      return { date: p.date, value: (Math.pow(ratio, k) - 1) * 100 };
    }

    return { date: p.date, value: (ratio - 1) * 100 };
  });

  return {
    points,
    valueKind: percentagePoints ? "PERCENTAGE_POINTS" : "PERCENT",
    units,
    unitsShort,
    warnings,
    formulaStep: formulaFor(mode, percentagePoints),
  };
}
