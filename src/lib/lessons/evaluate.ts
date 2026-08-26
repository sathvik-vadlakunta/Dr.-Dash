import {
  RECESSION_SLUG,
  defaultPopulationSlug,
  recessionIntervals,
} from "@/lib/dashboard/defaults";
import type { EvalFn } from "@/lib/lessons/schema";
import { applyTransform, type SeriesLoader } from "@/lib/series/transform";
import { emptyTransform, type Point, type TransformSpec } from "@/lib/series/types";

/**
 * Section 19.4. A closed whitelist of evaluators, each computing its answer
 * from live data at grading time. Nothing here interprets a string as code, and
 * `AnswerSpec.fn` is a Zod enum, so a lesson cannot smuggle in a function that
 * is not on this list.
 *
 * Every result is in *display units*, after `displayScale`, so the number the
 * student reads off the chart and the number the key computes are the same
 * number.
 */

export interface EvaluatorContext {
  loader: SeriesLoader;
}

type Args = Record<string, unknown>;

function str(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function optionalStr(args: Args, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function num(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== "number") throw new Error(`${key} must be a number`);
  return value;
}

function spec(args: Args, overrides: Partial<TransformSpec> = {}): TransformSpec {
  const raw = args.transform;
  const partial = (raw && typeof raw === "object" ? raw : {}) as Partial<TransformSpec>;
  return { ...emptyTransform(), ...partial, ...overrides };
}

/**
 * Run the real pipeline, then hand back values in display units.
 *
 * A lesson names the transform, not the helper series, exactly as a student
 * would: "turn on Per capita", not "divide by B230RC0Q173SBEA". So the catalog
 * defaults are resolved here the same way `/plot` resolves them, or the key
 * would fail on a question the student can answer.
 */
async function transformed(
  ctx: EvaluatorContext,
  slug: string,
  transform: TransformSpec,
): Promise<{ points: Point[]; displayScale: number }> {
  const base = await ctx.loader(slug);

  const resolved: TransformSpec = {
    ...transform,
    deflatorSlug: transform.real
      ? (transform.deflatorSlug ?? base.flags?.defaultDeflator ?? "GDPDEF")
      : transform.deflatorSlug,
    populationSlug: transform.perCapita
      ? (transform.populationSlug ??
        base.flags?.defaultPopulation ??
        defaultPopulationSlug(base.frequency))
      : transform.populationSlug,
  };

  const result = await applyTransform(base, resolved, ctx.loader);
  return {
    points: result.points.map((p) => ({
      date: p.date,
      value: p.value === null ? null : p.value / (result.displayScale || 1),
    })),
    displayScale: result.displayScale,
  };
}

function at(points: Point[], date: string): number | null {
  return points.find((p) => p.date === date)?.value ?? null;
}

function inWindow(points: Point[], start: string, end: string): Point[] {
  return points.filter((p) => p.date >= start && p.date <= end && p.value !== null);
}

type Evaluator = (ctx: EvaluatorContext, args: Args) => Promise<number | string | null>;

const EVALUATORS: Record<EvalFn, Evaluator> = {
  valueAt: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    return at(points, str(args, "date"));
  },

  yoyAt: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args, { growth: "YOY" }));
    return at(points, str(args, "date"));
  },

  annualizedPopAt: async (ctx, args) => {
    const { points } = await transformed(
      ctx,
      str(args, "slug"),
      spec(args, { growth: "POP_ANNUALIZED" }),
    );
    return at(points, str(args, "date"));
  },

  realValueAt: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), {
      ...spec(args),
      real: true,
      baseYear: num(args, "baseYear"),
      deflatorSlug: optionalStr(args, "deflatorSlug"),
    });
    return at(points, str(args, "date"));
  },

  perCapitaAt: async (ctx, args) => {
    const real = args.real === true;
    const { points } = await transformed(ctx, str(args, "slug"), {
      ...spec(args),
      perCapita: true,
      real,
      baseYear: real ? num(args, "baseYear") : null,
      deflatorSlug: real ? optionalStr(args, "deflatorSlug") : null,
    });
    return at(points, str(args, "date"));
  },

  ratioAt: async (ctx, args) => {
    const real = args.real === true;
    const { points } = await transformed(ctx, str(args, "slug"), {
      ...spec(args),
      percentOfSlug: str(args, "denominatorSlug"),
      real,
      baseYear: real ? num(args, "baseYear") : null,
      deflatorSlug: real ? optionalStr(args, "deflatorSlug") : null,
    });
    return at(points, str(args, "date"));
  },

  meanOver: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const window = inWindow(points, str(args, "start"), str(args, "end"));
    if (window.length === 0) return null;
    return window.reduce((sum, p) => sum + (p.value ?? 0), 0) / window.length;
  },

  maxOver: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const window = inWindow(points, str(args, "start"), str(args, "end"));
    if (window.length === 0) return null;
    return Math.max(...window.map((p) => p.value ?? Number.NEGATIVE_INFINITY));
  },

  minOver: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const window = inWindow(points, str(args, "start"), str(args, "end"));
    if (window.length === 0) return null;
    return Math.min(...window.map((p) => p.value ?? Number.POSITIVE_INFINITY));
  },

  argmaxOver: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const window = inWindow(points, str(args, "start"), str(args, "end"));
    if (window.length === 0) return null;
    return window.reduce((best, p) => ((p.value ?? -Infinity) > (best.value ?? -Infinity) ? p : best))
      .date;
  },

  argminOver: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const window = inWindow(points, str(args, "start"), str(args, "end"));
    if (window.length === 0) return null;
    return window.reduce((best, p) => ((p.value ?? Infinity) < (best.value ?? Infinity) ? p : best))
      .date;
  },

  changeBetween: async (ctx, args) => {
    const { points } = await transformed(ctx, str(args, "slug"), spec(args));
    const a = at(points, str(args, "dateA"));
    const b = at(points, str(args, "dateB"));
    if (a === null || b === null) return null;
    return b - a;
  },

  countRecessionsBetween: async (ctx, args) => {
    const usrec = await ctx.loader(RECESSION_SLUG);
    const start = str(args, "start");
    const end = str(args, "end");
    return recessionIntervals(usrec.points).filter((i) => i.start >= start && i.start <= end).length;
  },
};

export async function evaluate(
  fn: EvalFn,
  args: Args,
  ctx: EvaluatorContext,
): Promise<number | string | null> {
  const evaluator = EVALUATORS[fn];
  if (!evaluator) throw new Error(`Unknown evaluator ${fn}`);
  return evaluator(ctx, args);
}

/**
 * Section 19.4. Numeric input parsing: strip `%`, `$`, `,`, and whitespace, and
 * accept a leading sign. Anything else is not a number, and rejecting it must
 * not consume one of the student's tries.
 */
export function parseNumericResponse(raw: string): number | null {
  const cleaned = raw.replace(/[%$,\s]/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
