"use client";

import { clsx } from "clsx";
import { truncateLabel } from "@/lib/series/format";
import { seriesColor, type PlottedResult } from "@/types";

/**
 * Section 14.5. One chip per series. Clicking selects it for the SELECTED
 * transform scope; shift-click adds to the selection. Chips are keyboard
 * reachable and report their selection through `aria-pressed`.
 */

export interface ChartLegendProps {
  series: PlottedResult[];
  selectedSlugs: string[];
  onSelect: (slug: string, additive: boolean) => void;
  onToggleAxis: (slug: string) => void;
  onRemove: (slug: string) => void;
}

const FREQUENCY_BADGE: Record<string, string> = {
  DAILY: "D",
  WEEKLY: "W",
  MONTHLY: "M",
  QUARTERLY: "Q",
  ANNUAL: "A",
};

export function ChartLegend({
  series,
  selectedSlugs,
  onSelect,
  onToggleAxis,
  onRemove,
}: ChartLegendProps) {
  if (series.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2 py-3">
      {series.map((s) => {
        const selected = selectedSlugs.includes(s.slug);
        return (
          <li key={s.slug}>
            <span
              className={clsx(
                "flex items-center gap-2 rounded-control border bg-surface px-2 py-1",
                selected ? "border-accent outline outline-2 outline-accent" : "border-rule",
              )}
            >
              <button
                type="button"
                role="button"
                aria-pressed={selected}
                title={s.label}
                onClick={(event) => onSelect(s.slug, event.shiftKey)}
                className="flex items-center gap-2 text-left"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-4"
                  style={{ background: seriesColor(s.colorIndex) }}
                />
                <span className="text-small text-ink">{truncateLabel(s.label)}</span>
                <span className="font-mono text-data text-ink-muted">
                  {FREQUENCY_BADGE[s.frequency] ?? s.frequency}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleAxis(s.slug)}
                aria-label={`Move ${s.label} to the ${s.axis === "left" ? "right" : "left"} axis`}
                className="rounded-control border border-rule px-1 font-mono text-data text-ink-muted hover:bg-surface-sunken"
              >
                {s.axis === "left" ? "L" : "R"}
              </button>

              <button
                type="button"
                onClick={() => onRemove(s.slug)}
                aria-label={`Remove ${s.label}`}
                className="rounded-control px-1 text-ink-muted hover:text-danger"
              >
                ✕
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default ChartLegend;
