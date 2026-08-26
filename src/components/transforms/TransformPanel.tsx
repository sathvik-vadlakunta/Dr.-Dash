"use client";

import { useMemo } from "react";
import { ApplyScopeToggle, type ApplyScope } from "@/components/transforms/ApplyScopeToggle";
import { GrowthControl } from "@/components/transforms/GrowthControl";
import { PerCapitaControl } from "@/components/transforms/PerCapitaControl";
import { PercentOfControl } from "@/components/transforms/PercentOfControl";
import { RealControl } from "@/components/transforms/RealControl";
import { Button } from "@/components/ui/Button";
import type { PlottedSeries } from "@/lib/dashboard/urlState";
import type { GrowthMode, TransformSpec } from "@/lib/series/types";
import { PREFERRED_BASE_YEAR, defaultBaseYear } from "@/lib/dashboard/defaults";
import type { SeriesDetail } from "@/types";

/**
 * Section 15. The part of the product the brief calls its real power, so it
 * gets the most careful interaction design: every control writes to the URL
 * immediately, there is no Apply button, and a disabled control keeps its label
 * and explains itself.
 */

export interface TransformPanelProps {
  entries: PlottedSeries[];
  details: Record<string, SeriesDetail | undefined>;
  scope: ApplyScope;
  selectedSlugs: string[];
  onScopeChange: (scope: ApplyScope) => void;
  onPatch: (patch: Partial<TransformSpec>, control: keyof TransformSpec | "growth") => void;
  onReset: () => void;
  highlightedControl: string | null;
}

/** Section 15.3's copy table. The most specific row that applies wins. */
export function teachingCopy(spec: TransformSpec, baseYear: number | null): string {
  const { real, perCapita, percentOfSlug, growth } = spec;
  const growing = growth !== "NONE";

  if (real && perCapita && growing) {
    return "This is the growth rate of living standards, free of both inflation and population growth.";
  }
  if (real && perCapita) {
    return "Real per capita values are the standard measure of material living standards.";
  }
  if (real && growing) {
    return "A real growth rate strips out inflation and shows how fast real quantities changed.";
  }
  if (percentOfSlug) {
    return "A ratio shows relative size. Watch whether the share rises or falls, not whether the level rises or falls.";
  }
  if (perCapita) {
    return "Dividing by population turns an aggregate into a per-person figure, which is what living standards depend on.";
  }
  if (real) {
    return `Inflation changes what a dollar buys. A real series values every period at ${baseYear ?? "base year"} prices, so changes reflect quantities, not prices.`;
  }
  if (growth === "POP_ANNUALIZED") {
    return "Annualizing answers: if this period repeated for a year, how much would the series change?";
  }
  if (growth === "YOY" || growth === "POP") {
    return "A growth rate shows how fast something is changing. Trends and volatility are easier to see here than in the level.";
  }
  return "A level shows how big something is. Try a transform to see what else this data can tell you.";
}

/** The spec the controls display: the first target series' spec. */
function activeEntries(
  entries: PlottedSeries[],
  scope: ApplyScope,
  selectedSlugs: string[],
): PlottedSeries[] {
  if (scope === "ALL") return entries;
  return entries.filter((e) => selectedSlugs.includes(e.slug));
}

export function TransformPanel({
  entries,
  details,
  scope,
  selectedSlugs,
  onScopeChange,
  onPatch,
  onReset,
  highlightedControl,
}: TransformPanelProps) {
  const active = activeEntries(entries, scope, selectedSlugs);
  const first = active[0];
  const spec = first?.transform;
  const detail = first ? details[first.slug] : undefined;

  const disabled = scope === "SELECTED" && selectedSlugs.length === 0;

  const caps = detail?.capabilities;
  const reasons = detail?.disabledReasons ?? {};

  const ratesActive = useMemo(
    () => active.some((e) => details[e.slug]?.kind === "RATE_PERCENT"),
    [active, details],
  );

  const deflators = useMemo(
    () => [
      { slug: "GDPDEF", label: "GDP Deflator" },
      { slug: "CPIAUCSL", label: "CPI, All Items" },
      { slug: "PCEPI", label: "PCE Price Index" },
    ],
    [],
  );

  const populations = useMemo(
    () => [
      { slug: "POPTHM", label: "Population, Monthly" },
      { slug: "B230RC0Q173SBEA", label: "Population, Quarterly" },
      { slug: "CNP16OV", label: "Civilian Noninst. Population" },
    ],
    [],
  );

  const highlight = (control: string) =>
    highlightedControl === control ? "border-l-2 border-accent pl-3" : "pl-3";

  return (
    <aside
      aria-label="Transforms"
      className="flex h-full w-full flex-col gap-6 overflow-y-auto border-l border-rule p-4"
    >
      <ApplyScopeToggle
        scope={scope}
        onChange={onScopeChange}
        selectionCount={selectedSlugs.length}
      />

      {entries.length === 0 ? (
        <p className="text-small text-ink-muted">Plot a series to transform it.</p>
      ) : (
        <fieldset disabled={disabled} className="flex flex-col gap-6 border-0 p-0">
          <div className={highlight("growth")}>
            <GrowthControl
              value={spec?.growth ?? "NONE"}
              enabled={(caps?.growth ?? true) && !disabled}
              reason={reasons.growth}
              ratesActive={ratesActive}
              onChange={(growth: GrowthMode) => onPatch({ growth }, "growth")}
            />
          </div>

          <div className={highlight("real")}>
            <RealControl
              on={spec?.real ?? false}
              baseYear={spec?.baseYear ?? null}
              deflatorSlug={spec?.deflatorSlug ?? detail?.defaultDeflator ?? null}
              validBaseYears={detail?.validBaseYears ?? []}
              deflators={deflators}
              enabled={(caps?.real ?? false) && !disabled}
              reason={reasons.real}
              onToggle={(on) =>
                onPatch(
                  on
                    ? {
                        real: true,
                        // The URL grammar only carries `r<year>`, so turning
                        // the control on has to name a year immediately. If the
                        // catalog detail has not landed yet, 2017 is the
                        // documented preference and /plot answers with the
                        // valid range if the deflator cannot cover it.
                        baseYear:
                          spec?.baseYear ??
                          defaultBaseYear(detail?.validBaseYears ?? []) ??
                          PREFERRED_BASE_YEAR,
                      }
                    : // Turning real off clears the base year but keeps an
                      // explicitly chosen deflator (Section 15.2).
                      { real: false, baseYear: null },
                  "real",
                )
              }
              onBaseYear={(baseYear) => onPatch({ baseYear }, "baseYear")}
              onDeflator={(deflatorSlug) => onPatch({ deflatorSlug }, "deflatorSlug")}
            />
          </div>

          <div className={highlight("perCapita")}>
            <PerCapitaControl
              on={spec?.perCapita ?? false}
              populationSlug={spec?.populationSlug ?? detail?.defaultPopulation ?? null}
              populations={populations}
              enabled={(caps?.perCapita ?? false) && !disabled}
              reason={reasons.perCapita}
              onToggle={(perCapita) => onPatch({ perCapita }, "perCapita")}
              onPopulation={(populationSlug) => onPatch({ populationSlug }, "populationSlug")}
            />
          </div>

          <div className={highlight("percentOf")}>
            <PercentOfControl
              value={spec?.percentOfSlug ?? null}
              enabled={(caps?.denominator ?? true) && !disabled}
              reason={reasons.denominator}
              onChange={(percentOfSlug) => onPatch({ percentOfSlug }, "percentOfSlug")}
            />
          </div>

          <Button variant="ghost" className="self-start px-2" onClick={onReset}>
            Reset transforms
          </Button>
        </fieldset>
      )}

      {/* Section 15.3: the teaching affordance, in the mono utility face. */}
      <p className="rounded-control border border-rule bg-surface-sunken p-3 font-mono text-[13px] leading-[18px] text-ink">
        {teachingCopy(
          spec ?? {
            real: false,
            baseYear: null,
            deflatorSlug: null,
            perCapita: false,
            populationSlug: null,
            percentOfSlug: null,
            growth: "NONE",
          },
          spec?.baseYear ?? null,
        )}
      </p>
    </aside>
  );
}

export default TransformPanel;
