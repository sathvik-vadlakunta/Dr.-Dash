"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CategoryTree } from "@/components/catalog/CategoryTree";
import { SeriesSearch } from "@/components/catalog/SeriesSearch";
import { ChartLegend } from "@/components/chart/ChartLegend";
import { ChartToolbar } from "@/components/chart/ChartToolbar";
import { RecessionBands } from "@/components/chart/RecessionBands";
import { TransformBar } from "@/components/chart/TransformBar";
import { TransformPanel } from "@/components/transforms/TransformPanel";
import type { ApplyScope } from "@/components/transforms/ApplyScopeToggle";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { STARTERS } from "@/lib/dashboard/defaults";
import {
  MAX_SERIES,
  decodeState,
  encodeState,
  type DashboardState,
  type PlottedSeries,
} from "@/lib/dashboard/urlState";
import { downloadCsv, toTableRows } from "@/lib/csv/exportChart";
import { axisLabel } from "@/lib/series/format";
import type { TransformSpec } from "@/lib/series/types";
import type {
  ApiErrorBody,
  CategoryNodeDto,
  PlotResponse,
  PublishResult,
  SavedDashboard,
  SeriesDetail,
} from "@/types";

/**
 * The dashboard's client half. The catalog tree is fetched on the server and
 * handed in as a prop (Section 21.2); the chart, legend, toolbar, and transform
 * panel are the only client components, and Recharts is loaded dynamically so
 * it does not sit in the first-load bundle.
 */

const SeriesChart = dynamic(
  () => import("@/components/chart/SeriesChart").then((m) => m.SeriesChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

function ChartSkeleton() {
  return (
    <div className="relative h-[520px] w-full max-md:h-[360px]" aria-hidden>
      <div className="skeleton h-full w-full" />
    </div>
  );
}

export interface DashboardWorkspaceProps {
  categories: CategoryNodeDto[];
  /** Set on the published and embedded pages, where the state is not the URL's. */
  initialState?: DashboardState;
  /**
   * Section 17.1 and 17.2. `app` is the signed-in workspace; `public` drops the
   * catalog and the save action but stays fully interactive; `embed` also drops
   * the copy link, and the top bar is removed by the rule in `globals.css`.
   */
  chrome?: "app" | "public" | "embed";
  /** Names the exported files where there is no save dialog to read a title from. */
  exportTitle?: string | null;
  height?: number;
}

const DEBOUNCE_MS = 150;

/**
 * Section 16.3. Three panes above 1200 px; between 768 and 1200 the catalog
 * collapses to a drawer; below 768 the catalog and the transforms are bottom
 * sheets and the chart is full width.
 */
type Viewport = "wide" | "medium" | "narrow";

const WIDE = "(min-width: 1200px)";
const MEDIUM = "(min-width: 768px)";

function subscribeToViewport(onChange: () => void): () => void {
  const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

function readViewport(): Viewport {
  if (window.matchMedia(WIDE).matches) return "wide";
  return window.matchMedia(MEDIUM).matches ? "medium" : "narrow";
}

/**
 * A panel is rendered inline or inside a modal, never both: two copies would
 * mean two elements carrying the same label and the same id, and a screen
 * reader would read the hidden one. The server has no viewport, so it renders
 * the three-pane layout and a narrower client re-lays out on its first commit.
 */
function useViewport(): Viewport {
  return useSyncExternalStore(subscribeToViewport, readViewport, () => "wide" as const);
}

export function DashboardWorkspace({
  categories,
  initialState,
  chrome = "app",
  exportTitle = null,
  height,
}: DashboardWorkspaceProps) {
  const isApp = chrome === "app";
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const query = params.toString();

  const urlState: DashboardState = useMemo(() => {
    const fromUrl = decodeState(new URLSearchParams(query));
    // A published page seeds from the stored dashboard until the visitor
    // touches a control, after which their own URL wins.
    if (initialState && fromUrl.series.length === 0) return initialState;
    return fromUrl;
  }, [query, initialState]);

  /**
   * Control changes update the address bar with the history API rather than
   * the router. Two reasons. It is synchronous, so a toggle is reflected on the
   * next render instead of after an RSC round trip, which is what the 80 ms
   * re-render budget of Section 21.2 needs. And `router.push` is not reliable
   * while the page is still settling: a push issued during hydration is
   * dropped, and the click looks to the user like it did nothing.
   *
   * `local` is what has been written; the URL wins again on a back or forward.
   */
  const [local, setLocal] = useState<DashboardState | null>(null);
  const state: DashboardState = local ?? urlState;

  const [plot, setPlot] = useState<PlotResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SeriesDetail | undefined>>({});
  const [scope, setScope] = useState<ApplyScope>("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [hiddenNonPositive, setHiddenNonPositive] = useState(0);
  const [highlightedControl, setHighlightedControl] = useState<string | null>(null);

  // Section 16.3. Which of the two side panels is currently a modal, and open.
  const viewport = useViewport();
  const [openPanel, setOpenPanel] = useState<"catalog" | "transforms" | null>(null);
  const catalogInline = viewport === "wide";
  const transformsInline = viewport !== "narrow";

  const chartRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  /**
   * Every control here is server-rendered before it is interactive, so "the
   * markup is on screen" and "clicking it does something" are different
   * moments. This marks the second one, which is what automation has to wait
   * for and what a slow connection makes visible to a real user too.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  /**
   * Section 21.1.8. "Page titles are unique and descriptive:
   * `Real GDP, YoY % - Dr. Dash`." On the dashboard the page *is* what is
   * plotted, so the title follows the legend. The published and embedded pages
   * are named on the server by the dashboard they show, and must not be
   * renamed here.
   */
  useEffect(() => {
    if (!isApp) return;
    const labels = plot?.series.map((s) => s.label) ?? [];
    document.title = labels.length > 0 ? `${labels.join(", ")} - Dr. Dash` : "Dashboard - Dr. Dash";
  }, [isApp, plot]);

  // ---- URL writes --------------------------------------------------------

  /**
   * Two controls touched in quick succession must not each compute from the
   * pre-first-write state, or the second write drops the first one's
   * transform. The ref is the synchronous view of what has been written.
   */
  const pendingState = useRef<DashboardState | null>(null);
  pendingState.current = state;

  useEffect(() => {
    // A real navigation (back, forward, or a starter link) makes the URL
    // authoritative again.
    setLocal(null);
    pendingState.current = null;
  }, [query]);

  useEffect(() => {
    // Widening the window puts a panel back in the layout; leaving its modal
    // open would then show it twice.
    if (openPanel === "catalog" && catalogInline) setOpenPanel(null);
    if (openPanel === "transforms" && transformsInline) setOpenPanel(null);
  }, [openPanel, catalogInline, transformsInline]);

  useEffect(() => {
    const onPopState = () => setLocal(null);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const currentState = useCallback((): DashboardState => pendingState.current ?? urlState, [urlState]);

  const write = useCallback((next: DashboardState, mode: "replace" | "push") => {
    pendingState.current = next;
    setLocal(next);

    const search = encodeState(next).toString();
    const url = `${window.location.pathname}${search.length > 0 ? `?${search}` : ""}`;
    // Section 12.4: a transform change replaces, so the back button undoes
    // adding or removing a series rather than every toggle along the way.
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  // ---- Data --------------------------------------------------------------

  useEffect(() => {
    if (state.series.length === 0) {
      setPlot(null);
      setError(null);
      return;
    }

    const id = ++sequence.current;
    const controller = new AbortController();
    setPending(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/plot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            series: state.series,
            start: state.start,
            end: state.end,
            includeRecessions: state.showRecessions,
          }),
          signal: controller.signal,
        });

        // Only the latest response is applied; a stale one is dropped.
        if (id !== sequence.current) return;

        if (!res.ok) {
          const body = (await res.json()) as ApiErrorBody;
          setError(`The chart could not be built. ${body.error.message}`);
          return;
        }

        const body = (await res.json()) as { data: PlotResponse };
        setPlot(body.data);
        setError(null);

        for (const slug of body.data.missing) {
          toast.show(`${slug} is not available and was removed.`, "warn");
        }
        if (body.data.missing.length > 0) {
          write(
            { ...state, series: state.series.filter((s) => !body.data.missing.includes(s.slug)) },
            "replace",
          );
        }
        for (const warning of new Set(body.data.series.flatMap((s) => s.warnings))) {
          toast.show(warning, "warn");
        }
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return;
        setError(`The chart could not be built. ${(fetchError as Error).message}`);
      } finally {
        if (id === sequence.current) setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `write` and `toast` are stable; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.series, state.start, state.end, state.showRecessions]);

  // Fetch the catalog detail each plotted series' controls need.
  useEffect(() => {
    const missing = state.series.map((s) => s.slug).filter((slug) => !details[slug]);
    if (missing.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missing.map(async (slug) => {
        const res = await fetch(`/api/v1/series/${slug}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { data: SeriesDetail };
        return body.data;
      }),
    ).then((loaded) => {
      if (cancelled) return;
      setDetails((current) => {
        const next = { ...current };
        for (const detail of loaded) if (detail) next[detail.slug] = detail;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [state.series, details]);

  // ---- Actions -----------------------------------------------------------

  const plottedSlugs = state.series.map((s) => s.slug);

  const addSeries = useCallback(
    (slug: string) => {
      const base = currentState();
      if (base.series.some((s) => s.slug === slug)) return;
      if (base.series.length >= MAX_SERIES) {
        toast.show(`A chart holds at most ${MAX_SERIES} series.`, "warn");
        return;
      }
      const entry: PlottedSeries = {
        slug,
        axis: "left",
        transform: {
          real: false,
          baseYear: null,
          deflatorSlug: null,
          perCapita: false,
          populationSlug: null,
          percentOfSlug: null,
          growth: "NONE",
        },
      };
      write({ ...base, series: [...base.series, entry] }, "push");
      // Plotting from the drawer or the sheet is the reason it was opened, so
      // it closes and puts the chart back in view.
      setOpenPanel(null);
    },
    [currentState, toast, write],
  );

  const removeSeries = useCallback(
    (slug: string) => {
      const base = currentState();
      write({ ...base, series: base.series.filter((s) => s.slug !== slug) }, "push");
      setSelected((current) => current.filter((s) => s !== slug));
    },
    [currentState, write],
  );

  const toggleAxis = useCallback(
    (slug: string) => {
      const base = currentState();
      write(
        {
          ...base,
          series: base.series.map((s) =>
            s.slug === slug ? { ...s, axis: s.axis === "left" ? "right" : "left" } : s,
          ),
        },
        "replace",
      );
    },
    [currentState, write],
  );

  /**
   * Section 6.8. With ALL, a control writes into every plotted series whose
   * capability allows it, and reports how many it skipped. With SELECTED it
   * writes only to the highlighted ones.
   */
  const patch = useCallback(
    (change: Partial<TransformSpec>, control: keyof TransformSpec | "growth") => {
      const base = currentState();
      const targets = scope === "ALL" ? base.series.map((s) => s.slug) : selected;
      if (targets.length === 0) return;

      const capabilityFor = (slug: string): boolean => {
        const caps = details[slug]?.capabilities;
        if (!caps) return true;
        if (control === "real" || control === "baseYear" || control === "deflatorSlug") {
          return caps.real;
        }
        if (control === "perCapita" || control === "populationSlug") return caps.perCapita;
        if (control === "percentOfSlug") return caps.denominator;
        if (control === "growth") return caps.growth;
        return true;
      };

      const allowed = targets.filter(capabilityFor);
      const skipped = targets.filter((slug) => !capabilityFor(slug));

      if (skipped.length > 0) {
        const names = skipped.map((slug) => details[slug]?.shortLabel ?? slug).join(", ");
        toast.show(
          `${allowed.length} of ${targets.length} series updated. ${names} does not support this transform.`,
          "warn",
        );
      }

      // Section 15.2: turning on a ratio switches per capita off, because
      // population cancels.
      const turningOnRatio = change.percentOfSlug !== undefined && change.percentOfSlug !== null;

      write(
        {
          ...base,
          series: base.series.map((s) => {
            if (!allowed.includes(s.slug)) return s;
            const next = { ...s.transform, ...change };
            if (turningOnRatio && next.perCapita) {
              next.perCapita = false;
              toast.show("Per capita turned off. Population cancels in a ratio.", "warn");
            }
            return { ...s, transform: next };
          }),
        },
        "replace",
      );
    },
    [scope, selected, currentState, details, toast, write],
  );

  const resetTransforms = useCallback(() => {
    const base = currentState();
    write(
      {
        ...base,
        series: base.series.map((s) => ({
          ...s,
          transform: {
            real: false,
            baseYear: null,
            deflatorSlug: null,
            perCapita: false,
            populationSlug: null,
            percentOfSlug: null,
            growth: "NONE",
          },
        })),
      },
      "replace",
    );
  }, [currentState, write]);

  /** Section 20.5: removing a chip removes exactly that transform. */
  const removeStep = useCallback(
    (stepIndex: number) => {
      const base = currentState();
      const target = selected[0] ?? base.series[0];
      const entry = typeof target === "string" ? base.series.find((s) => s.slug === target) : target;
      const result = plot?.series.find((s) => s.slug === entry?.slug);
      if (!entry || !result) return;

      const step = result.formulaChain[stepIndex] ?? "";
      const change: Partial<TransformSpec> = step.startsWith("x ")
        ? { real: false, baseYear: null }
        : step.includes("x 100")
          ? { percentOfSlug: null }
          : step.startsWith("/ ")
            ? { perCapita: false }
            : { growth: "NONE" };

      write(
        {
          ...base,
          series: base.series.map((s) =>
            s.slug === entry.slug ? { ...s, transform: { ...s.transform, ...change } } : s,
          ),
        },
        "replace",
      );
    },
    [plot, selected, currentState, write],
  );

  const saveDashboard = useCallback(
    async (title: string, description: string): Promise<SavedDashboard> => {
      const res = await fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, state }),
      });
      const body = (await res.json()) as { data: SavedDashboard } | ApiErrorBody;
      if (!res.ok) throw new Error((body as ApiErrorBody).error.message);
      return (body as { data: SavedDashboard }).data;
    },
    [state],
  );

  /** Section 10.6. Publishing twice keeps the token, so a shared link survives. */
  const publishDashboard = useCallback(
    async (id: string, allowEmbed: boolean): Promise<PublishResult> => {
      const res = await fetch(`/api/v1/dashboards/${id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowEmbed }),
      });
      const body = (await res.json()) as { data: PublishResult } | ApiErrorBody;
      if (!res.ok) throw new Error((body as ApiErrorBody).error.message);
      return (body as { data: PublishResult }).data;
    },
    [],
  );

  const unpublishDashboard = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/v1/dashboards/${id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unpublish: true }),
    });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      throw new Error(body.error.message);
    }
  }, []);

  // ---- Render ------------------------------------------------------------

  const activeResult = useMemo(() => {
    if (!plot) return null;
    const slug = selected[0] ?? plot.series[0]?.slug;
    return plot.series.find((s) => s.slug === slug) ?? null;
  }, [plot, selected]);

  const table = useMemo(() => (plot ? toTableRows(plot.series) : null), [plot]);

  const catalog = (
    <>
      <SeriesSearch plottedSlugs={plottedSlugs} onPlot={addSeries} />
      <CategoryTree nodes={categories} plottedSlugs={plottedSlugs} onPlot={addSeries} />
    </>
  );

  const transforms = (
    <TransformPanel
      entries={state.series}
      details={details}
      scope={scope}
      selectedSlugs={selected}
      onScopeChange={setScope}
      onPatch={patch}
      onReset={resetTransforms}
      highlightedControl={highlightedControl}
    />
  );

  // Below 1200 px the chart takes the width the collapsed panels give back.
  const columns = isApp
    ? catalogInline
      ? "grid-cols-[280px_1fr_320px]"
      : transformsInline
        ? "grid-cols-[1fr_320px]"
        : "grid-cols-1"
    : transformsInline
      ? "grid-cols-[1fr_320px]"
      : "grid-cols-1";

  return (
    <div
      data-ready={hydrated ? "true" : "false"}
      data-layout={viewport}
      className={`grid ${isApp ? "min-h-[calc(100vh-56px)] " : ""}${columns}`}
    >
      {isApp && catalogInline ? (
        <section aria-label="Catalog" className="border-r border-rule">
          <div className="panel-header">
            <span className="eyebrow">Catalog</span>
          </div>
          {catalog}
        </section>
      ) : null}

      <section aria-label="Chart" className="flex min-w-0 flex-col">
        {/* Only when at least one panel has actually collapsed into a modal. */}
        {(isApp && !catalogInline) || !transformsInline ? (
          <div className="flex items-center gap-2 border-b border-rule px-4 py-2">
            {isApp && !catalogInline ? (
              <Button variant="secondary" onClick={() => setOpenPanel("catalog")}>
                Catalog
              </Button>
            ) : null}
            {transformsInline ? null : (
              <Button variant="secondary" onClick={() => setOpenPanel("transforms")}>
                Transforms
              </Button>
            )}
          </div>
        ) : null}

        <ChartToolbar
          plot={plot}
          start={state.start}
          end={state.end}
          showRecessions={state.showRecessions}
          logScale={state.logScale}
          hiddenNonPositive={hiddenNonPositive}
          canSave={state.series.length > 0}
          chartRef={chartRef}
          exportTitle={exportTitle}
          showCopyLink={chrome !== "embed"}
          onRangeChange={(start, end) => write({ ...currentState(), start, end }, "replace")}
          onToggleRecessions={(showRecessions) =>
            write({ ...currentState(), showRecessions }, "replace")
          }
          onToggleLogScale={(logScale) => write({ ...currentState(), logScale }, "replace")}
          {...(isApp
            ? {
                onSave: saveDashboard,
                onPublish: publishDashboard,
                onUnpublish: unpublishDashboard,
              }
            : {})}
        />

        <div className="relative min-w-0 flex-1 px-4" ref={chartRef}>
          {state.series.length === 0 ? (
            <div className="flex h-[520px] flex-col items-center justify-center gap-4 text-center">
              <p className="text-title text-ink">Pick a category, then a series.</p>
              <p className="text-small text-ink-muted">← The catalog is on the left.</p>
              <div className={isApp ? "flex flex-wrap justify-center gap-2" : "hidden"}>
                {STARTERS.map((starter) => (
                  <Button
                    key={starter.label}
                    variant="secondary"
                    onClick={() =>
                      write(decodeState(new URLSearchParams(starter.query)), "push")
                    }
                  >
                    {starter.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="flex h-[520px] flex-col items-center justify-center gap-4">
              <p className="max-w-[52ch] text-center text-body text-ink">{error}</p>
              <Button variant="primary" onClick={() => router.refresh()}>
                Try again
              </Button>
            </div>
          ) : plot === null ? (
            <ChartSkeleton />
          ) : (
            <div className={pending ? "opacity-60 transition-opacity duration-180" : undefined}>
              <SeriesChart
                plot={plot}
                logScale={state.logScale}
                showRecessions={state.showRecessions}
                selectedSlugs={selected}
                height={height}
                onNonPositiveHidden={setHiddenNonPositive}
              />
            </div>
          )}
        </div>

        <TransformBar
          result={activeResult}
          showsWhich={(plot?.series.length ?? 0) > 1}
          onRemoveStep={removeStep}
          onHoverStep={(index) => {
            if (index === null) {
              setHighlightedControl(null);
              return;
            }
            const step = activeResult?.formulaChain[index] ?? "";
            setHighlightedControl(
              step.startsWith("x ")
                ? "real"
                : step.includes("x 100")
                  ? "percentOf"
                  : step.startsWith("/ ")
                    ? "perCapita"
                    : "growth",
            );
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <ChartLegend
            series={plot?.series ?? []}
            selectedSlugs={selected}
            onSelect={(slug, additive) =>
              setSelected((current) =>
                additive
                  ? current.includes(slug)
                    ? current.filter((s) => s !== slug)
                    : [...current, slug]
                  : current.length === 1 && current[0] === slug
                    ? []
                    : [slug],
              )
            }
            onToggleAxis={toggleAxis}
            onRemove={removeSeries}
          />
          <div className="flex items-center gap-3">
            <RecessionBands intervals={plot?.recessions ?? []} visible={state.showRecessions} />
            {plot ? (
              <Button variant="ghost" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Hide table" : "View as table"}
              </Button>
            ) : null}
          </div>
        </div>

        {showTable && table ? (
          <div className="border-t border-rule px-4 py-3">
            <Table caption={table.caption} head={table.head} rows={table.rows} />
          </div>
        ) : null}

        {plot ? (
          <footer className="flex flex-wrap gap-4 border-t border-rule px-4 py-3 text-small text-ink-muted">
            {plot.series.map((s) => {
              const detail = details[s.slug];
              const stale =
                detail?.lastSyncedAt !== undefined &&
                detail?.lastSyncedAt !== null &&
                Date.now() - new Date(detail.lastSyncedAt).getTime() > 48 * 60 * 60 * 1000;
              return (
                <span key={s.slug} className="flex items-center gap-2">
                  {stale ? (
                    <span
                      aria-hidden
                      title={`Last checked ${detail?.lastSyncedAt?.slice(0, 10)}. Data may be behind the source.`}
                      className="inline-block h-2 w-2 rounded-full bg-warn"
                    />
                  ) : null}
                  <span className="font-mono text-data">{s.slug}</span>
                  <span>
                    {detail?.sourceName ?? "FRED"}
                    {detail?.fredLastUpdated
                      ? ` · updated ${detail.fredLastUpdated.slice(0, 10)}`
                      : ""}
                  </span>
                </span>
              );
            })}
            <span className="ml-auto">
              Axis: {axisLabel(plot.series.filter((s) => s.axis === "left").map((s) => s.unitsShort))}
            </span>
            {isApp ? (
              <Link href="/data" className="text-accent underline">
                Manage data
              </Link>
            ) : (
              // Section 17.1: on a published page the footer carries the
              // provenance and the download together, so a visitor who scrolls
              // to the sources can take the data with them.
              <Button
                variant="ghost"
                className="px-2"
                onClick={() =>
                  downloadCsv(plot.series, {
                    today: new Date().toISOString().slice(0, 10),
                    title: exportTitle,
                  })
                }
              >
                Download CSV
              </Button>
            )}
          </footer>
        ) : null}
      </section>

      {transformsInline ? transforms : null}

      {isApp && !catalogInline ? (
        <Dialog
          open={openPanel === "catalog"}
          onClose={() => setOpenPanel(null)}
          title="Catalog"
          variant={viewport === "medium" ? "drawer" : "sheet"}
        >
          {catalog}
        </Dialog>
      ) : null}

      {transformsInline ? null : (
        <Dialog
          open={openPanel === "transforms"}
          onClose={() => setOpenPanel(null)}
          title="Transforms"
          variant="sheet"
        >
          {transforms}
        </Dialog>
      )}
    </div>
  );
}

export default DashboardWorkspace;
