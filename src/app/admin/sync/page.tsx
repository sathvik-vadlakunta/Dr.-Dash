"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody, SeriesListItem } from "@/types";

/**
 * Section 16.7. A per-series table with its own Sync button, plus Sync all and
 * Full resync all. A full resync exists because the incremental path only looks
 * back 400 days and a benchmark revision can reach further (Section 8.5).
 */

interface SyncRunRow {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  seriesAttempted: number;
  seriesUpdated: number;
  observationsWritten: number;
  errorsJson: Array<{ slug: string; code: string; message: string }>;
}

export default function AdminSyncPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Sync - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <SyncAdmin />
    </ToastProvider>
  );
}

function SyncAdmin() {
  const toast = useToast();
  const [runs, setRuns] = useState<SyncRunRow[]>([]);
  const [series, setSeries] = useState<SeriesListItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [runsRes, seriesRes] = await Promise.all([
      fetch("/api/v1/admin/sync/status"),
      fetch("/api/v1/series?source=fred&limit=100"),
    ]);
    if (runsRes.ok) {
      const body = (await runsRes.json()) as { data: SyncRunRow[] };
      setRuns(body.data);
    }
    if (seriesRes.ok) {
      const body = (await seriesRes.json()) as { data: SeriesListItem[] };
      setSeries(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync(slugs: string[] | null, full: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slugs, full }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      toast.show(full ? "Full resync started." : "Sync started.");
      setTimeout(() => void load(), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-[100ch] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-display-m">Sync</h1>

      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void sync(null, false)}>
          Sync all
        </Button>
        <Button disabled={busy} onClick={() => void sync(null, true)}>
          Full resync all
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-title">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing has run yet.</p>
        ) : (
          <Table
            head={["Started", "Status", "Attempted", "Updated", "Observations", "Errors"]}
            numericColumns={[2, 3, 4, 5]}
            rows={runs.map((r) => [
              r.startedAt.slice(0, 16).replace("T", " "),
              r.status === "PARTIAL" || r.status === "FAILED" ? (
                <span key={r.id} className="text-warn">
                  {r.seriesAttempted - r.seriesUpdated} of {r.seriesAttempted} series failed to sync.
                </span>
              ) : (
                r.status
              ),
              String(r.seriesAttempted),
              String(r.seriesUpdated),
              String(r.observationsWritten),
              String(Array.isArray(r.errorsJson) ? r.errorsJson.length : 0),
            ])}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title">Series</h2>
        <Table
          head={["Series", "Slug", "Frequency", "Coverage", ""]}
          rows={series.map((s) => [
            s.shortLabel,
            <span key={s.slug} className="font-mono text-data">
              {s.slug}
            </span>,
            s.frequency,
            `${s.observationStart ?? "—"} to ${s.observationEnd ?? "—"}`,
            <span key={`${s.slug}-actions`} className="flex gap-2">
              <Button variant="ghost" className="px-2" onClick={() => void sync([s.slug], false)}>
                Sync
              </Button>
              <Button variant="ghost" className="px-2" onClick={() => void sync([s.slug], true)}>
                Full resync
              </Button>
            </span>,
          ])}
        />
      </section>
    </main>
  );
}
