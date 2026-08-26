"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTick, formatPeriod, formatValue, yearTickStep } from "@/lib/series/format";
import { downsampleForRender } from "@/lib/series/downsample";
import { seriesColor, type PlotResponse, type PlottedResult } from "@/types";

/**
 * Section 14. The chart is the product, so everything around it stays quiet and
 * the chart itself never animates on a data change: an animating line implies
 * the data moved, and it did not, the way of looking at it did.
 */

export interface SeriesChartProps {
  plot: PlotResponse;
  logScale: boolean;
  showRecessions: boolean;
  selectedSlugs: string[];
  height?: number;
  onNonPositiveHidden?: (count: number) => void;
}

interface Row {
  t: number;
  [slug: string]: number | null;
}

function toTimestamp(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

function isCurrency(result: PlottedResult): boolean {
  return result.unitsShort.includes("$") || result.units.includes("Dollars");
}

/**
 * Section 14.1. One row per timestamp across the union of every series' dates.
 * A series missing a date is `null`, never omitted and never interpolated: the
 * gap is information.
 */
function buildRows(series: PlottedResult[], logScale: boolean): { rows: Row[]; hidden: number } {
  const byslug = new Map<string, Map<number, number | null>>();
  const timestamps = new Set<number>();
  let hidden = 0;

  for (const s of series) {
    const rendered = downsampleForRender(s.points);
    const map = new Map<number, number | null>();
    for (const p of rendered) {
      const t = toTimestamp(p.date);
      timestamps.add(t);
      let value = p.value;
      // A log axis cannot show a non-positive value, so drop it rather than
      // letting the library silently clamp it.
      if (logScale && value !== null && value <= 0) {
        value = null;
        hidden += 1;
      }
      map.set(t, value);
    }
    byslug.set(s.slug, map);
  }

  const rows = [...timestamps]
    .sort((a, b) => a - b)
    .map((t) => {
      const row: Row = { t };
      for (const s of series) row[s.slug] = byslug.get(s.slug)?.get(t) ?? null;
      return row;
    });

  return { rows, hidden };
}

function yearTicks(rows: Row[]): number[] {
  const first = rows[0]?.t;
  const last = rows[rows.length - 1]?.t;
  if (first === undefined || last === undefined) return [];

  const firstYear = new Date(first).getUTCFullYear();
  const lastYear = new Date(last).getUTCFullYear();
  const step = yearTickStep(firstYear, lastYear);

  const ticks: number[] = [];
  const start = Math.ceil(firstYear / step) * step;
  for (let year = start; year <= lastYear; year += step) ticks.push(Date.UTC(year, 0, 1));
  return ticks;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: number;
  series: PlottedResult[];
  rows: Row[];
}

function ChartTooltip({ active, label, series, rows }: ChartTooltipProps) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.t === label);
  if (!row) return null;

  const frequency = series[0]?.frequency ?? "MONTHLY";
  const iso = new Date(label).toISOString().slice(0, 10);

  // Rows sort by absolute value descending, so the biggest mover reads first.
  const entries = series
    .map((s) => ({ s, value: row[s.slug] ?? null }))
    .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));

  return (
    <div className="min-w-[280px] rounded-card border border-rule bg-surface-raised p-3 shadow-popover">
      <p className="font-mono text-data text-ink-muted">{formatPeriod(iso, frequency)}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {entries.map(({ s, value }) => (
          <li key={s.slug} className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-2 text-small text-ink">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: seriesColor(s.colorIndex) }}
              />
              {s.label}
            </span>
            <span
              className={`font-mono text-data ${value === null ? "text-ink-muted" : "text-ink"}`}
            >
              {formatValue(value, s, { currency: isCurrency(s) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SeriesChart({
  plot,
  logScale,
  showRecessions,
  selectedSlugs,
  height,
  onNonPositiveHidden,
}: SeriesChartProps) {
  const [cursor, setCursor] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const { rows, hidden } = useMemo(
    () => buildRows(plot.series, logScale),
    [plot.series, logScale],
  );

  useEffect(() => {
    onNonPositiveHidden?.(hidden);
  }, [hidden, onNonPositiveHidden]);

  const ticks = useMemo(() => yearTicks(rows), [rows]);
  const hasRight = plot.series.some((s) => s.axis === "right");

  const leftSpansZero = useMemo(() => spansZero(plot.series, "left", rows), [plot.series, rows]);
  const rightSpansZero = useMemo(() => spansZero(plot.series, "right", rows), [plot.series, rows]);

  /**
   * Section 21.1.2. The plot area is focusable and the arrow keys walk a readout
   * cursor one period at a time. The announcement is the non-visual equivalent
   * of a tooltip, not a lesser fallback.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) return;
      const index = cursor === null ? rows.length - 1 : rows.findIndex((r) => r.t === cursor);
      const periodsPerYear =
        plot.series[0]?.frequency === "QUARTERLY"
          ? 4
          : plot.series[0]?.frequency === "ANNUAL"
            ? 1
            : 12;

      let next = index;
      switch (event.key) {
        case "ArrowLeft":
          next = Math.max(0, index - 1);
          break;
        case "ArrowRight":
          next = Math.min(rows.length - 1, index + 1);
          break;
        case "PageUp":
          next = Math.max(0, index - periodsPerYear);
          break;
        case "PageDown":
          next = Math.min(rows.length - 1, index + periodsPerYear);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = rows.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      setCursor(rows[next]?.t ?? null);
    },
    [cursor, rows, plot.series],
  );

  const announcement = useMemo(() => {
    if (cursor === null) return "";
    const row = rows.find((r) => r.t === cursor);
    if (!row) return "";
    const iso = new Date(cursor).toISOString().slice(0, 10);
    const period = formatPeriod(iso, plot.series[0]?.frequency ?? "MONTHLY");
    const parts = plot.series.map(
      (s) => `${s.label}, ${formatValue(row[s.slug] ?? null, s, { currency: isCurrency(s) })}`,
    );
    return `${period}, ${parts.join(", ")}`;
  }, [cursor, rows, plot.series]);

  const chartHeight = height ?? 520;

  return (
    <div className="relative">
      <div
        ref={plotRef}
        role="img"
        tabIndex={0}
        aria-label={
          plot.series.length === 0
            ? "An empty chart."
            : `Chart of ${plot.series.map((s) => s.label).join(", ")}. Use the arrow keys to read values.`
        }
        onKeyDown={onKeyDown}
        className="rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={rows} margin={{ top: 8, right: 56, bottom: 8, left: 56 }}>
            <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />

            {/* Bands are drawn before the lines, so the lines sit on top. */}
            {showRecessions
              ? plot.recessions.map((interval) => (
                  <ReferenceArea
                    key={`${interval.start}-${interval.end}`}
                    x1={toTimestamp(interval.start)}
                    x2={toTimestamp(interval.end)}
                    yAxisId="left"
                    fill="var(--band)"
                    fillOpacity={1}
                    strokeOpacity={0}
                    ifOverflow="hidden"
                  />
                ))
              : null}

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(value: number) => String(new Date(value).getUTCFullYear())}
              stroke="var(--rule-strong)"
              tick={{ fill: "var(--ink-muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}
            />

            <YAxis
              yAxisId="left"
              orientation="left"
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ["auto", "auto"] : undefined}
              stroke="var(--rule-strong)"
              tick={{ fill: "var(--ink-muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}
              tickFormatter={(value: number) => tickLabel(value, plot, "left")}
              width={72}
            />

            {hasRight ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                scale={logScale ? "log" : "auto"}
                domain={logScale ? ["auto", "auto"] : undefined}
                stroke="var(--rule-strong)"
                tick={{ fill: "var(--ink-muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}
                tickFormatter={(value: number) => tickLabel(value, plot, "right")}
                width={72}
              />
            ) : null}

            {leftSpansZero ? (
              <ReferenceLine y={0} yAxisId="left" stroke="var(--rule-strong)" />
            ) : null}
            {hasRight && rightSpansZero ? (
              <ReferenceLine y={0} yAxisId="right" stroke="var(--rule-strong)" />
            ) : null}

            {cursor !== null ? (
              <ReferenceLine x={cursor} yAxisId="left" stroke="var(--focus)" strokeWidth={1} />
            ) : null}

            <Tooltip
              content={({ active, label }) => (
                <ChartTooltip
                  active={active}
                  label={typeof label === "number" ? label : undefined}
                  series={plot.series}
                  rows={rows}
                />
              )}
              cursor={{ stroke: "var(--rule-strong)" }}
            />

            {plot.series.map((s) => (
              <Line
                key={s.slug}
                yAxisId={s.axis}
                dataKey={s.slug}
                name={s.label}
                type="linear"
                dot={false}
                strokeWidth={selectedSlugs.includes(s.slug) ? 3 : undefined}
                stroke={seriesColor(s.colorIndex)}
                connectNulls={false}
                isAnimationActive={false}
                style={
                  selectedSlugs.includes(s.slug)
                    ? undefined
                    : { strokeWidth: "var(--series-stroke-width)" }
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p aria-live="polite" data-testid="chart-readout" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function spansZero(series: PlottedResult[], axis: "left" | "right", rows: Row[]): boolean {
  const slugs = series.filter((s) => s.axis === axis).map((s) => s.slug);
  if (slugs.length === 0) return false;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    for (const slug of slugs) {
      const value = row[slug];
      if (value === null || value === undefined) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return min < 0 && max > 0;
}

function tickLabel(value: number, plot: PlotResponse, axis: "left" | "right"): string {
  const first = plot.series.find((s) => s.axis === axis);
  if (!first) return String(value);
  return axisTick(value, first, { currency: isCurrency(first) });
}

export default SeriesChart;
