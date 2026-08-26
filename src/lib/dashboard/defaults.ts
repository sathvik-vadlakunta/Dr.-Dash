import type { Frequency, Point } from "@/lib/series/types";

/**
 * Defaults the dashboard applies when the user has not chosen otherwise.
 */

/**
 * Section 6.5.3. The engine picks the population series by the *aligned*
 * frequency, because dividing a quarterly aggregate by a monthly population
 * would first have to downsample the population anyway, and the national
 * accounts publish their own quarterly midperiod series for exactly this.
 */
export const POPULATION_MONTHLY = "POPTHM";
export const POPULATION_QUARTERLY = "B230RC0Q173SBEA";

export function defaultPopulationSlug(frequency: Frequency): string {
  switch (frequency) {
    case "QUARTERLY":
      return POPULATION_QUARTERLY;
    case "DAILY":
    case "WEEKLY":
    case "MONTHLY":
    case "ANNUAL":
      // Annual falls back to the monthly series, aggregated by the alignment
      // step, so there is no separate annual population to maintain.
      return POPULATION_MONTHLY;
  }
}

/** Section 7.2: the three selectable deflators. */
export const DEFLATOR_SLUGS = ["GDPDEF", "CPIAUCSL", "PCEPI"] as const;
export type DeflatorSlug = (typeof DEFLATOR_SLUGS)[number];

/** Section 15.1: the base year defaults to 2017 when the deflator covers it. */
export const PREFERRED_BASE_YEAR = 2017;

export function defaultBaseYear(validBaseYears: number[]): number | null {
  if (validBaseYears.length === 0) return null;
  if (validBaseYears.includes(PREFERRED_BASE_YEAR)) return PREFERRED_BASE_YEAR;
  return validBaseYears[validBaseYears.length - 1] ?? null;
}

/** Section 7.2: the recession flag, never listed in the catalog. */
export const RECESSION_SLUG = "USREC";

/**
 * Section 16.3. Four one-click starters for the empty state, each setting a
 * complete URL including a sensible transform, so the first chart a new user
 * sees is already making a point.
 */
export interface Starter {
  label: string;
  query: string;
}

export const STARTERS: Starter[] = [
  { label: "Real GDP", query: "s=GDPC1" },
  { label: "Unemployment rate", query: "s=UNRATE" },
  { label: "CPI inflation", query: "s=CPIAUCSL~g:yoy" },
  { label: "Fed funds rate", query: "s=FEDFUNDS" },
];

/** Section 14.4: the date-range presets, computed from the latest date plotted. */
export const RANGE_PRESETS = [
  { label: "Max", years: null },
  { label: "50Y", years: 50 },
  { label: "25Y", years: 25 },
  { label: "10Y", years: 10 },
  { label: "5Y", years: 5 },
] as const;

export function presetStart(latestDate: string, years: number | null): string | null {
  if (years === null) return null;
  const year = Number(latestDate.slice(0, 4)) - years;
  return `${String(year).padStart(4, "0")}${latestDate.slice(4)}`;
}

export interface RecessionInterval {
  start: string;
  end: string;
}

/**
 * Section 10.4. A run of consecutive 1s in USREC becomes one interval, ending
 * at the first date after the run so the band covers the whole recession. NBER
 * dates recessions by month, so the band's right edge is the first month that
 * is no longer part of it.
 */
export function recessionIntervals(points: Point[]): RecessionInterval[] {
  const out: RecessionInterval[] = [];
  let runStart: string | null = null;
  let previousDate: string | null = null;

  for (const p of points) {
    const inRecession = p.value === 1;
    if (inRecession && runStart === null) runStart = p.date;
    if (!inRecession && runStart !== null) {
      out.push({ start: runStart, end: p.date });
      runStart = null;
    }
    previousDate = p.date;
  }
  // A run still open at the end of the data ends at the last date we have.
  if (runStart !== null && previousDate !== null) out.push({ start: runStart, end: previousDate });

  return out;
}

