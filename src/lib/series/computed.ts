import type { Frequency, Point, SeriesData, SeriesKind } from "@/lib/series/types";

/**
 * Section 7.3. The brief says some series useful for teaching are not
 * conveniently reported by any government database, so Dr. Dash constructs
 * them. They are a typed registry, deliberately not a string DSL: a definition
 * is code, reviewable and unit-testable, and adding one is a code change.
 *
 * Every definition here combines inputs that are already at the definition's
 * own frequency, so the joins below are exact period-start joins. Nothing in
 * this file resamples, which is what keeps it independent of the transform
 * engine (align.ts arrives in a later phase and serves the plotting path).
 */

export interface ComputedDef {
  slug: string;
  shortLabel: string;
  title: string;
  description: string;
  units: string;
  unitsShort: string;
  kind: SeriesKind;
  frequency: Frequency;
  dependsOn: string[];
  canGrowth: boolean;
  compute(inputs: Record<string, SeriesData>): Point[];
}

/** Look one input up, or fail loudly rather than silently producing an empty series. */
function need(inputs: Record<string, SeriesData>, slug: string): SeriesData {
  const s = inputs[slug];
  if (!s) throw new Error(`COMPUTED_INPUT_MISSING: ${slug}`);
  return s;
}

function valueMap(s: SeriesData): Map<string, number | null> {
  return new Map(s.points.map((p) => [p.date, p.value]));
}

/**
 * Combine two same-frequency series period by period over the union of their
 * dates. A missing or null operand yields `null`: Rule 0.1.8 forbids
 * substituting zero, forward filling, or interpolating.
 */
function combine(
  a: SeriesData,
  b: SeriesData,
  f: (x: number, y: number) => number | null,
): Point[] {
  const av = valueMap(a);
  const bv = valueMap(b);
  const dates = [...new Set([...av.keys(), ...bv.keys()])].sort();
  return dates.map((date) => {
    const x = av.get(date);
    const y = bv.get(date);
    if (x === undefined || x === null || y === undefined || y === null) {
      return { date, value: null };
    }
    return { date, value: f(x, y) };
  });
}

/** Month or quarter exactly one year earlier: the period start with the year decremented. */
function oneYearEarlier(date: string): string {
  const year = Number(date.slice(0, 4));
  return `${String(year - 1).padStart(4, "0")}${date.slice(4)}`;
}

/**
 * Year-over-year percent change by exact date lookup, never by array index, so
 * a gap in the series produces `null` rather than a wrong comparison
 * (Section 6.4).
 */
function yoyPercent(s: SeriesData): Point[] {
  const v = valueMap(s);
  return s.points.map((p) => {
    const prior = v.get(oneYearEarlier(p.date));
    if (p.value === null || prior === undefined || prior === null || prior === 0) {
      return { date: p.date, value: null };
    }
    return { date: p.date, value: (p.value / prior - 1) * 100 };
  });
}

export const COMPUTED_SERIES: ComputedDef[] = [
  {
    slug: "DD_INFL_CPI",
    shortLabel: "CPI Inflation Rate",
    title: "CPI Inflation Rate (Dr. Dash)",
    description:
      "The year-over-year percent change in the CPI, published as a series in its own right.",
    units: "Percent",
    unitsShort: "Percent",
    kind: "RATE_PERCENT",
    frequency: "MONTHLY",
    dependsOn: ["CPIAUCSL"],
    canGrowth: true,
    compute: (inputs) => yoyPercent(need(inputs, "CPIAUCSL")),
  },
  {
    slug: "DD_MISERY",
    shortLabel: "Misery Index",
    title: "Misery Index (Dr. Dash)",
    description: "The unemployment rate plus the CPI inflation rate.",
    units: "Percent",
    unitsShort: "Percent",
    kind: "RATE_PERCENT",
    frequency: "MONTHLY",
    // Depends on another constructed series, which is why the recompute has to
    // run in topological order.
    dependsOn: ["UNRATE", "DD_INFL_CPI"],
    canGrowth: true,
    compute: (inputs) =>
      combine(need(inputs, "UNRATE"), need(inputs, "DD_INFL_CPI"), (u, i) => u + i),
  },
  {
    slug: "DD_REAL_FFR",
    shortLabel: "Real Fed Funds Rate",
    title: "Real Federal Funds Rate (Dr. Dash)",
    description: "The federal funds rate minus CPI inflation.",
    units: "Percent",
    unitsShort: "Percent",
    kind: "RATE_PERCENT",
    frequency: "MONTHLY",
    dependsOn: ["FEDFUNDS", "DD_INFL_CPI"],
    canGrowth: true,
    compute: (inputs) =>
      combine(need(inputs, "FEDFUNDS"), need(inputs, "DD_INFL_CPI"), (r, i) => r - i),
  },
  {
    slug: "DD_OUTPUT_GAP",
    shortLabel: "Output Gap",
    title: "Output Gap (Dr. Dash)",
    description: "Real GDP minus potential real GDP, as a percent of potential.",
    units: "Percent of Potential GDP",
    unitsShort: "Percent",
    kind: "RATE_PERCENT",
    frequency: "QUARTERLY",
    dependsOn: ["GDPC1", "GDPPOT"],
    canGrowth: false,
    compute: (inputs) =>
      combine(need(inputs, "GDPC1"), need(inputs, "GDPPOT"), (actual, potential) =>
        potential === 0 ? null : ((actual - potential) / potential) * 100,
      ),
  },
];

export const COMPUTED_BY_SLUG: ReadonlyMap<string, ComputedDef> = new Map(
  COMPUTED_SERIES.map((d) => [d.slug, d]),
);

export class CircularDependencyError extends Error {
  readonly code = "CIRCULAR_DEPENDENCY";
  readonly cycle: string[];
  constructor(cycle: string[]) {
    super(`CIRCULAR_DEPENDENCY: ${cycle.join(" -> ")}`);
    this.name = "CircularDependencyError";
    this.cycle = cycle;
  }
}

/**
 * Section 7.3: recompute in dependency order after every sync. Only constructed
 * slugs participate in the ordering; a FRED dependency is a leaf.
 */
export function topologicalOrder(defs: ComputedDef[] = COMPUTED_SERIES): ComputedDef[] {
  const bySlug = new Map(defs.map((d) => [d.slug, d]));
  const state = new Map<string, "visiting" | "done">();
  const order: ComputedDef[] = [];

  const visit = (def: ComputedDef, trail: string[]): void => {
    const seen = state.get(def.slug);
    if (seen === "done") return;
    if (seen === "visiting") throw new CircularDependencyError([...trail, def.slug]);

    state.set(def.slug, "visiting");
    for (const dep of def.dependsOn) {
      const depDef = bySlug.get(dep);
      if (depDef) visit(depDef, [...trail, def.slug]);
    }
    state.set(def.slug, "done");
    order.push(def);
  };

  for (const def of defs) visit(def, []);
  return order;
}
