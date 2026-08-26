import { z } from "zod";

/**
 * Section 6.1. The vocabulary the transform engine reasons in. Everything here
 * is plain data: the engine never touches Prisma or the network, it is handed
 * `SeriesData` and a `loader` callback.
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type SeriesKind =
  | "LEVEL_CURRENCY"
  | "LEVEL_COUNT"
  | "INDEX"
  | "RATE_PERCENT"
  | "RATIO"
  | "FLAG";

export type Aggregation = "AVG" | "SUM" | "EOP";

export type SeriesSource = "FRED" | "CONSTRUCTED" | "USER" | "ORG";

/** One observation. `date` is the period START, ISO "YYYY-MM-DD". `value` null means missing. */
export interface Point {
  date: string;
  value: number | null;
}

/**
 * Catalog flags the capability matrix cannot derive from `kind` alone
 * (Section 6.7): whether a count is itself a population series, and the
 * per-series overrides the seed sets, such as `NETEXP.canGrowth = false`
 * because a series that crosses zero has no meaningful growth rate.
 */
export interface SeriesFlags {
  isPopulation?: boolean;
  canReal?: boolean;
  canPerCapita?: boolean;
  canGrowth?: boolean;
  canBeDenominator?: boolean;
  /** The catalog's own choice of deflator and population for this series. */
  defaultDeflator?: string | null;
  defaultPopulation?: string | null;
}

/** A series plus everything the engine needs to reason about it. */
export interface SeriesData {
  slug: string;
  shortLabel: string;
  frequency: Frequency;
  kind: SeriesKind;
  units: string;
  unitsShort: string;
  unitMultiplier: number;
  aggregation: Aggregation;
  isNominal: boolean;
  isRealAlready: boolean;
  points: Point[]; // sorted ascending by date, no duplicate dates
  flags?: SeriesFlags;
}

export type GrowthMode = "NONE" | "YOY" | "POP" | "POP_ANNUALIZED";

export interface TransformSpec {
  real: boolean;
  baseYear: number | null; // required when real === true
  deflatorSlug: string | null; // defaults to series.defaultDeflator
  perCapita: boolean;
  populationSlug: string | null;
  percentOfSlug: string | null;
  growth: GrowthMode;
}

export type ValueKind = "LEVEL" | "PERCENT" | "PERCENTAGE_POINTS" | "INDEX";

export interface TransformResult {
  points: Point[];
  units: string; // human readable, e.g. "2017 Dollars per person"
  unitsShort: string; // e.g. "2017 $/person"
  valueKind: ValueKind;
  frequency: Frequency; // may be coarser than input after alignment
  label: string; // legend label, Section 13.3
  formulaChain: string[]; // for the transform bar, Section 20.5
  warnings: string[];
  /** Section 13.1: the formatter divides base-unit values by this. */
  displayScale: number;
  /** What the engine actually did, after rules like "population cancels in a ratio". */
  effectiveSpec: TransformSpec;
}

export const EMPTY_TRANSFORM: TransformSpec = {
  real: false,
  baseYear: null,
  deflatorSlug: null,
  perCapita: false,
  populationSlug: null,
  percentOfSlug: null,
  growth: "NONE",
};

export function emptyTransform(): TransformSpec {
  return { ...EMPTY_TRANSFORM };
}

/**
 * Every failure the engine can raise carries a code the API and the UI copy
 * tables (Section 18) key off. It is never a bare `Error`.
 */
export type TransformErrorCode =
  | "BASE_YEAR_INCOMPLETE"
  | "BASE_YEAR_REQUIRED"
  | "DEFLATOR_MISSING"
  | "DENOMINATOR_NOT_COMPARABLE"
  | "POPULATION_MISSING"
  | "SERIES_NOT_FOUND"
  | "TRANSFORM_NOT_ALLOWED"
  | "UNSUPPORTED_FREQUENCY";

export class TransformError extends Error {
  readonly code: TransformErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: TransformErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TransformError";
    this.code = code;
    this.details = details;
  }
}

export function isTransformError(e: unknown): e is TransformError {
  return e instanceof TransformError;
}

// ---------------------------------------------------------------------------
// Catalog invariants (Section 5.2), enforced as a Zod refinement so the seed,
// the import commit path, and `pnpm check:catalog` all apply the same rules.
// ---------------------------------------------------------------------------

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export const SERIES_KINDS = [
  "LEVEL_CURRENCY",
  "LEVEL_COUNT",
  "INDEX",
  "RATE_PERCENT",
  "RATIO",
  "FLAG",
] as const;
export const AGGREGATIONS = ["AVG", "SUM", "EOP"] as const;
export const SERIES_SOURCES = ["FRED", "CONSTRUCTED", "USER", "ORG"] as const;

/** Invariant 5: the only legal stored-unit scales. */
export const UNIT_MULTIPLIERS = [1, 1e3, 1e6, 1e9, 1e12] as const;

export const seriesFieldsSchema = z.object({
  slug: z.string().min(1),
  source: z.enum(SERIES_SOURCES),
  fredId: z.string().min(1).nullable(),
  title: z.string().min(1),
  shortLabel: z.string().min(1).max(28, "shortLabel must be 28 characters or fewer"),
  description: z.string().min(1),
  units: z.string().min(1),
  unitsShort: z.string().min(1),
  unitMultiplier: z.number(),
  frequency: z.enum(FREQUENCIES),
  seasonalAdjustment: z.enum(["SA", "NSA", "SAAR"]),
  kind: z.enum(SERIES_KINDS),
  isNominal: z.boolean(),
  isRealAlready: z.boolean(),
  canReal: z.boolean(),
  canPerCapita: z.boolean(),
  canGrowth: z.boolean(),
  canBeDenominator: z.boolean(),
  defaultDeflator: z.string().nullable(),
  defaultPopulation: z.string().nullable(),
  aggregation: z.enum(AGGREGATIONS),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  notes: z.string().nullable(),
  isPublic: z.boolean(),
});

export type SeriesFields = z.infer<typeof seriesFieldsSchema>;

/** Each entry is `{rule, message}` where `rule` is the Section 5.2 number. */
export interface InvariantViolation {
  slug: string;
  rule: number;
  message: string;
}

export function checkSeriesInvariants(s: SeriesFields): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const push = (rule: number, message: string) => out.push({ slug: s.slug, rule, message });

  // Rule 2: a rate, an index, or a flag is already scale free.
  if (s.kind === "RATE_PERCENT" || s.kind === "INDEX" || s.kind === "FLAG") {
    if (s.canReal) push(2, `kind ${s.kind} must have canReal = false`);
    if (s.canPerCapita) push(2, `kind ${s.kind} must have canPerCapita = false`);
  }

  // Rule 3: a nominal series must be deflatable and must name its deflator.
  if (s.isNominal) {
    if (!s.canReal) push(3, "isNominal = true requires canReal = true");
    if (s.defaultDeflator === null) push(3, "isNominal = true requires a defaultDeflator");
  }

  // Rule 4: dividing by population needs a population series to divide by.
  if (s.canPerCapita && s.defaultPopulation === null) {
    push(4, "canPerCapita = true requires a defaultPopulation");
  }

  // Rule 5: only these stored-unit scales exist.
  if (!UNIT_MULTIPLIERS.includes(s.unitMultiplier as (typeof UNIT_MULTIPLIERS)[number])) {
    push(5, `unitMultiplier ${s.unitMultiplier} is not one of 1, 1e3, 1e6, 1e9, 1e12`);
  }

  // Implied by rules 2 and 3 together: a series cannot be both nominal and real.
  if (s.isNominal && s.isRealAlready) {
    push(3, "isNominal and isRealAlready cannot both be true");
  }
  if (s.isRealAlready && s.canReal) {
    push(3, "isRealAlready = true requires canReal = false");
  }

  return out;
}

/** The Zod form of the same rules, for request payloads (import commit, admin approve). */
export const seriesFieldsWithInvariants = seriesFieldsSchema.superRefine((s, ctx) => {
  for (const v of checkSeriesInvariants(s)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Section 5.2 rule ${v.rule}: ${v.message}`,
    });
  }
});
