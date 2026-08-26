"use client";

import type { SeriesListItem } from "@/types";

/**
 * Section 9.2. The whole row is the plot affordance: one click on the category,
 * one click on the series, and it is on the chart. That is the two-click path
 * the brief asks for, and nothing may sit between them.
 */

export interface SeriesListProps {
  items: SeriesListItem[];
  plottedSlugs: string[];
  loading?: boolean;
  emptyMessage?: string;
  onPlot: (slug: string) => void;
}

const FREQUENCY_BADGE: Record<string, string> = {
  DAILY: "D",
  WEEKLY: "W",
  MONTHLY: "M",
  QUARTERLY: "Q",
  ANNUAL: "A",
};

export function SeriesList({
  items,
  plottedSlugs,
  loading,
  emptyMessage,
  onPlot,
}: SeriesListProps) {
  if (loading) {
    return (
      <ul className="flex flex-col gap-2 p-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="skeleton h-[36px] rounded-control" />
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return <p className="p-3 text-small text-ink-muted">{emptyMessage ?? "Nothing in this category yet."}</p>;
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const plotted = plottedSlugs.includes(item.slug);
        return (
          <li key={item.slug}>
            <button
              type="button"
              onClick={() => onPlot(item.slug)}
              aria-pressed={plotted}
              title={item.title}
              className="flex w-full items-center justify-between gap-2 border-b border-rule px-3 py-2 text-left hover:bg-surface-sunken"
            >
              <span className="truncate text-small text-ink">{item.shortLabel}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-data text-ink-muted">
                  {FREQUENCY_BADGE[item.frequency] ?? item.frequency}
                </span>
                <span className="text-small text-accent">{plotted ? "Plotted" : "Plot"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default SeriesList;
