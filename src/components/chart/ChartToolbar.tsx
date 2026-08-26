"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { RANGE_PRESETS, presetStart } from "@/lib/dashboard/defaults";
import { MIXED_UNITS, axisLabel } from "@/lib/series/format";
import { downloadCsv, downloadPng } from "@/lib/csv/exportChart";
import type { PlotResponse, PublishResult, SavedDashboard } from "@/types";

/**
 * Section 14.4. Date presets and the two date inputs on the left; the toggles
 * and the four export actions on the right. Every button names its outcome
 * (Section 20.7): Plot, Save, Publish, never Submit or OK.
 *
 * Section 17.2 asks for a publish dialog with a copyable iframe snippet but
 * Section 14.4 lists no `Publish` button, so publishing is the second half of
 * the save dialog: a dashboard has to exist before it can have a public URL,
 * and the two steps read as one action.
 */

/** Section 17.2's snippet is 520 px tall, and so is the embed page's default. */
export const EMBED_HEIGHT = 520;

export interface ChartToolbarProps {
  plot: PlotResponse | null;
  start: string | null;
  end: string | null;
  showRecessions: boolean;
  logScale: boolean;
  hiddenNonPositive: number;
  onRangeChange: (start: string | null, end: string | null) => void;
  onToggleRecessions: (value: boolean) => void;
  onToggleLogScale: (value: boolean) => void;
  chartRef: React.RefObject<HTMLDivElement | null>;
  /** Absent on a published or embedded page: a visitor has nothing to save. */
  onSave?: (title: string, description: string) => Promise<SavedDashboard>;
  onPublish?: (id: string, allowEmbed: boolean) => Promise<PublishResult>;
  onUnpublish?: (id: string) => Promise<void>;
  canSave?: boolean;
  /** Section 17.2: the embed has no copy link. */
  showCopyLink?: boolean;
  /** Names the exported files on a published page, where there is no dialog. */
  exportTitle?: string | null;
}

export function ChartToolbar({
  plot,
  start,
  end,
  showRecessions,
  logScale,
  hiddenNonPositive,
  onRangeChange,
  onToggleRecessions,
  onToggleLogScale,
  chartRef,
  onSave,
  onPublish,
  onUnpublish,
  canSave = false,
  showCopyLink = true,
  exportTitle = null,
}: ChartToolbarProps) {
  const toast = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  // Set once the dashboard exists; publishing needs an id to act on.
  const [saved, setSaved] = useState<SavedDashboard | null>(null);
  const [allowEmbed, setAllowEmbed] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);

  const latest = plot?.domain.end ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const leftUnits = plot ? axisLabel(plot.series.filter((s) => s.axis === "left").map((s) => s.unitsShort)) : "";
  const rightUnits = plot
    ? axisLabel(plot.series.filter((s) => s.axis === "right").map((s) => s.unitsShort))
    : "";
  const mixed = leftUnits === MIXED_UNITS || rightUnits === MIXED_UNITS;

  const fileTitle = saved?.title ?? exportTitle ?? (title.trim() || null);

  const snippet =
    published?.embedUrl && saved
      ? `<iframe src="${published.embedUrl}" width="100%" height="${EMBED_HEIGHT}" style="border:0"\n        title="${saved.title}" loading="lazy"></iframe>`
      : null;

  const exportCsv = () => {
    if (!plot) return;
    downloadCsv(plot.series, { today, title: fileTitle });
  };

  const exportPng = async () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg || !plot) return;
    try {
      await downloadPng(svg as SVGSVGElement, {
        today,
        title: fileTitle,
        formulaChain: plot.series[0]?.formulaChain ?? [],
        sources: [...new Set(plot.series.map((s) => s.slug))],
      });
    } catch (error) {
      toast.show((error as Error).message, "error");
    }
  };

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(message);
    } catch {
      toast.show("The clipboard is not available in this browser.", "warn");
    }
  };

  const closeSave = () => {
    setSaveOpen(false);
    // A second save starts a new dashboard rather than re-publishing the last.
    setSaved(null);
    setPublished(null);
    setAllowEmbed(false);
    setTitle("");
    setDescription("");
  };

  async function save() {
    if (!onSave) return;
    setBusy(true);
    try {
      setSaved(await onSave(title.trim(), description.trim()));
      toast.show("Dashboard saved.");
    } catch (error) {
      toast.show((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!onPublish || !saved) return;
    setBusy(true);
    try {
      setPublished(await onPublish(saved.id, allowEmbed));
      toast.show("Published.");
    } catch (error) {
      toast.show((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!onUnpublish || !saved) return;
    setBusy(true);
    try {
      await onUnpublish(saved.id);
      setPublished(null);
      toast.show("Unpublished. The old link no longer opens.");
    } catch (error) {
      toast.show((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Date range presets">
          {RANGE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              onClick={() => onRangeChange(latest ? presetStart(latest, preset.years) : null, null)}
              className="px-2"
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <Field
          label="Start"
          type="date"
          value={start ?? ""}
          onChange={(e) => onRangeChange(e.target.value || null, end)}
          className="font-mono text-data"
        />
        <Field
          label="End"
          type="date"
          value={end ?? ""}
          onChange={(e) => onRangeChange(start, e.target.value || null)}
          className="font-mono text-data"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            checked={showRecessions}
            onChange={(e) => onToggleRecessions(e.target.checked)}
          />
          Recessions {showRecessions ? "on" : "off"}
        </label>

        <label className="flex items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            checked={logScale}
            onChange={(e) => onToggleLogScale(e.target.checked)}
          />
          Log scale {logScale ? "on" : "off"}
        </label>

        <Button variant="ghost" onClick={exportCsv} disabled={!plot}>
          Download CSV
        </Button>
        <Button variant="ghost" onClick={exportPng} disabled={!plot}>
          Download PNG
        </Button>
        {showCopyLink ? (
          <Button variant="ghost" onClick={() => void copy(window.location.href, "Link copied.")}>
            Copy link
          </Button>
        ) : null}
        {onSave ? (
          <Button variant="primary" onClick={() => setSaveOpen(true)} disabled={!canSave}>
            Save
          </Button>
        ) : null}
      </div>

      {mixed ? (
        <p className="w-full rounded-control border border-warn px-3 py-2 text-small text-warn">
          Two different units share this axis. Move one to the right axis.
        </p>
      ) : null}

      {logScale && hiddenNonPositive > 0 ? (
        <p className="w-full rounded-control border border-warn px-3 py-2 text-small text-warn">
          {hiddenNonPositive} non-positive values hidden on a log scale.
        </p>
      ) : null}

      {onSave ? (
        <Dialog
          open={saveOpen}
          onClose={closeSave}
          title={saved ? "Publish this dashboard" : "Save this dashboard"}
          footer={
            saved ? (
              <>
                <Button onClick={closeSave}>Done</Button>
                {published ? (
                  <Button variant="secondary" disabled={busy} onClick={() => void unpublish()}>
                    Unpublish
                  </Button>
                ) : (
                  <Button variant="primary" disabled={busy} onClick={() => void publish()}>
                    Publish
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button onClick={closeSave}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={busy || title.trim().length === 0}
                  onClick={() => void save()}
                >
                  Save
                </Button>
              </>
            )
          }
        >
          {saved ? (
            <div className="flex flex-col gap-4">
              <p className="text-small text-ink-muted">
                {saved.title} is saved. Publishing gives it a public address that needs no account.
              </p>

              <label className="flex items-center gap-2 text-small text-ink">
                <input
                  type="checkbox"
                  checked={allowEmbed}
                  disabled={published !== null}
                  onChange={(e) => setAllowEmbed(e.target.checked)}
                />
                Allow embedding in other sites
              </label>

              {published?.url ? (
                <div className="flex flex-col gap-3">
                  <Field
                    label="Public link"
                    readOnly
                    value={published.url}
                    data-testid="public-url"
                    className="font-mono text-data"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void copy(published.url ?? "", "Link copied.")}
                  >
                    Copy link
                  </Button>

                  {snippet ? (
                    <>
                      <label className="flex flex-col gap-1 text-small text-ink">
                        Embed snippet
                        <textarea
                          readOnly
                          rows={3}
                          value={snippet}
                          data-testid="embed-snippet"
                          className="rounded-control border border-rule bg-surface-sunken p-2 font-mono text-data text-ink"
                        />
                      </label>
                      <Button
                        variant="secondary"
                        onClick={() => void copy(snippet, "Snippet copied.")}
                      >
                        Copy snippet
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Real GDP per capita, 1970 to today"
              />
              <Field
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                hint="Optional. Shown to anyone you publish this to."
              />
            </div>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}

export default ChartToolbar;
