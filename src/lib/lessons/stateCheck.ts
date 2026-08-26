import type { DashboardState } from "@/lib/dashboard/urlState";
import type { DashboardTarget } from "@/lib/lessons/schema";
import type { GrowthMode } from "@/lib/series/types";

/**
 * Section 19.3. The check runs entirely on the URL, with no network call, so
 * the checklist updates the instant a student touches a control. That is what
 * makes the task feel like part of the product rather than a quiz about it.
 */

export interface StateCheckResult {
  satisfied: boolean;
  missing: string[];
}

const GROWTH_NAMES: Record<GrowthMode, string> = {
  NONE: "level",
  YOY: "year over year",
  POP: "period over period",
  POP_ANNUALIZED: "annualized",
};

/** Labels come from the catalog when we have it, and fall back to the slug. */
export type LabelLookup = (slug: string) => string;

export function checkState(
  current: DashboardState,
  target: DashboardTarget,
  labelOf: LabelLookup = (slug) => slug,
): StateCheckResult {
  const missing: string[] = [];
  const plotted = new Map(current.series.map((s) => [s.slug, s]));

  for (const want of target.series) {
    const have = plotted.get(want.slug);
    if (!have) {
      missing.push(`Plot ${labelOf(want.slug)}.`);
      continue;
    }

    const t = want.transform ?? {};

    if (t.growth !== undefined && have.transform.growth !== t.growth) {
      missing.push(`Set growth to ${GROWTH_NAMES[t.growth]}.`);
    }
    if (t.real !== undefined && have.transform.real !== t.real) {
      missing.push(
        t.real ? "Turn on Adjust for inflation." : "Turn off Adjust for inflation.",
      );
    }
    if (t.baseYear !== undefined && t.baseYear !== null && have.transform.baseYear !== t.baseYear) {
      missing.push(`Set the base year to ${t.baseYear}.`);
    }
    if (t.perCapita !== undefined && have.transform.perCapita !== t.perCapita) {
      missing.push(t.perCapita ? "Turn on Per capita." : "Turn off Per capita.");
    }
    if (t.percentOfSlug !== undefined && have.transform.percentOfSlug !== t.percentOfSlug) {
      missing.push(
        t.percentOfSlug === null
          ? "Clear Show as percent of."
          : `Show it as a percent of ${labelOf(t.percentOfSlug)}.`,
      );
    }
    if (t.deflatorSlug !== undefined && t.deflatorSlug !== null &&
        have.transform.deflatorSlug !== t.deflatorSlug) {
      missing.push(`Use ${labelOf(t.deflatorSlug)} as the deflator.`);
    }
    if (want.axis !== undefined && have.axis !== want.axis) {
      missing.push(`Move ${labelOf(want.slug)} to the ${want.axis} axis.`);
    }
  }

  if (target.exactSeriesSet !== false) {
    const wanted = new Set(target.series.map((s) => s.slug));
    for (const have of current.series) {
      if (!wanted.has(have.slug)) missing.push(`Remove ${labelOf(have.slug)}.`);
    }
  }

  if (target.start !== undefined && target.start !== null && current.start !== target.start) {
    missing.push(`Set the start date to ${target.start}.`);
  }
  if (target.end !== undefined && target.end !== null && current.end !== target.end) {
    missing.push(`Set the end date to ${target.end}.`);
  }
  if (target.showRecessions !== undefined && current.showRecessions !== target.showRecessions) {
    missing.push(
      target.showRecessions ? "Turn on recession shading." : "Turn off recession shading.",
    );
  }

  return { satisfied: missing.length === 0, missing };
}

/**
 * Section 19.3's "Set it for me". Using it is allowed and costs no points: the
 * task exists for exposure, and the question after it is what is graded.
 */
export function targetToState(target: DashboardTarget, current: DashboardState): DashboardState {
  const next: DashboardState = {
    ...current,
    series: target.series.map((want) => {
      const existing = current.series.find((s) => s.slug === want.slug);
      return {
        slug: want.slug,
        axis: want.axis ?? existing?.axis ?? "left",
        transform: {
          real: false,
          baseYear: null,
          deflatorSlug: null,
          perCapita: false,
          populationSlug: null,
          percentOfSlug: null,
          growth: "NONE",
          ...(existing?.transform ?? {}),
          ...(want.transform ?? {}),
        },
      };
    }),
  };

  if (target.start !== undefined) next.start = target.start ?? null;
  if (target.end !== undefined) next.end = target.end ?? null;
  if (target.showRecessions !== undefined) next.showRecessions = target.showRecessions;

  return next;
}
