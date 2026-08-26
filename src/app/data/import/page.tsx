"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody, CategoryNodeDto } from "@/types";

/**
 * Section 9.3 and 16.4. Two steps on purpose: parse and show what could not be
 * read, then commit. Nothing reaches the catalog until the user has seen the
 * issues by row number and decided.
 */

interface ImportIssue {
  row: number | null;
  column?: string;
  code: string;
  message: string;
}

interface ImportJobDto {
  id: string;
  filename: string;
  rowCount: number;
  columns: Array<{ header: string; looksLikeRate: boolean }>;
  inferred: {
    frequency: string | null;
    kind: string;
    isNominal: boolean;
    unitsGuess: string;
  };
  preview: Array<Record<string, string>>;
  issues: ImportIssue[];
}

const KINDS = ["LEVEL_CURRENCY", "LEVEL_COUNT", "INDEX", "RATE_PERCENT", "RATIO"] as const;
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
const MULTIPLIERS = [
  { value: "1", label: "Ones" },
  { value: "1000", label: "Thousands" },
  { value: "1000000", label: "Millions" },
  { value: "1000000000", label: "Billions" },
  { value: "1000000000000", label: "Trillions" },
];

export default function ImportPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Import a CSV - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <Importer />
    </ToastProvider>
  );
}

function Importer() {
  const toast = useToast();
  const [job, setJob] = useState<ImportJobDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<CategoryNodeDto[]>([]);
  const [committed, setCommitted] = useState<string | null>(null);

  const [form, setForm] = useState({
    shortLabel: "",
    title: "",
    units: "",
    unitsShort: "",
    unitMultiplier: "1",
    frequency: "MONTHLY",
    kind: "LEVEL_CURRENCY" as (typeof KINDS)[number],
    isNominal: false,
    deflatorSlug: "CPIAUCSL",
    populationSlug: "",
    aggregation: "AVG",
    categoryId: "",
    column: "",
  });

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/categories?tree=1");
      if (!res.ok) return;
      const body = (await res.json()) as { data: CategoryNodeDto[] };
      setCategories(body.data);
      setForm((f) => ({ ...f, categoryId: f.categoryId || (body.data[0]?.id ?? "") }));
    })();
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setCommitted(null);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch("/api/v1/imports", { method: "POST", body: data });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      const body = (await res.json()) as { data: ImportJobDto };
      setJob(body.data);
      setForm((f) => ({
        ...f,
        column: body.data.columns[0]?.header ?? "",
        shortLabel: (body.data.columns[0]?.header ?? "").slice(0, 28),
        title: body.data.columns[0]?.header ?? "",
        units: body.data.inferred.unitsGuess,
        unitsShort: body.data.inferred.unitsGuess,
        frequency: body.data.inferred.frequency ?? "MONTHLY",
        kind: body.data.inferred.kind as (typeof KINDS)[number],
        isNominal: body.data.inferred.isNominal,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!job) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/imports/${job.id}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          unitMultiplier: Number(form.unitMultiplier),
          deflatorSlug: form.isNominal ? form.deflatorSlug : null,
          populationSlug: form.populationSlug || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      const body = (await res.json()) as { data: { series: { slug: string } } };
      setCommitted(body.data.series.slug);
      toast.show("Series imported.");
    } finally {
      setBusy(false);
    }
  }

  const usableRows = job ? job.rowCount : 0;
  const badRows = job ? new Set(job.issues.filter((i) => i.row !== null).map((i) => i.row)).size : 0;

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-display-m">Import a CSV</h1>
      <p className="text-body text-ink-muted">
        One date column and one or more value columns. Dates may be{" "}
        <span className="font-mono text-data">2020-03-01</span>,{" "}
        <span className="font-mono text-data">2020-03</span>,{" "}
        <span className="font-mono text-data">2020Q2</span>,{" "}
        <span className="font-mono text-data">2020</span>, or{" "}
        <span className="font-mono text-data">3/15/2020</span>. Up to 2 MB and 10,000 rows.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-small font-medium text-ink">
          CSV file
        </label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          className="text-small"
        />
      </div>

      {job ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-title">
              {job.filename} · {usableRows} rows read
            </h2>

            {job.issues.length > 0 ? (
              <div className="rounded-control border border-warn p-3">
                <p className="text-small text-warn">
                  {badRows} rows could not be read. Fix them or import the rest.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {job.issues.slice(0, 12).map((issue, i) => (
                    <li key={i} className="font-mono text-data text-ink-muted">
                      {issue.row !== null ? `Row ${issue.row}: ` : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-small text-ok">Every row read cleanly.</p>
            )}

            {job.preview.length > 0 ? (
              <Table
                caption="First ten rows, as read"
                head={Object.keys(job.preview[0] ?? {})}
                rows={job.preview.map((row) => Object.values(row))}
              />
            ) : null}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-title">Describe the series</h2>

            {job.columns.length > 1 ? (
              <Select
                label="Column"
                value={form.column}
                onChange={(e) => setForm({ ...form, column: e.target.value })}
                options={job.columns.map((c) => ({ value: c.header, label: c.header }))}
              />
            ) : null}

            <Field
              label="Short label"
              value={form.shortLabel}
              maxLength={28}
              hint="28 characters or fewer. This is what the legend shows."
              onChange={(e) => setForm({ ...form, shortLabel: e.target.value })}
            />
            <Field
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Field
              label="Units"
              value={form.units}
              onChange={(e) => setForm({ ...form, units: e.target.value })}
            />
            <Field
              label="Units, short"
              value={form.unitsShort}
              hint="What the axis says."
              onChange={(e) => setForm({ ...form, unitsShort: e.target.value })}
            />

            <Select
              label="Stored scale"
              value={form.unitMultiplier}
              onChange={(e) => setForm({ ...form, unitMultiplier: e.target.value })}
              options={MULTIPLIERS}
            />
            <Select
              label="Frequency"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              options={FREQUENCIES.map((f) => ({ value: f, label: f }))}
            />
            <Select
              label="Kind"
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as (typeof KINDS)[number] })
              }
              options={KINDS.map((k) => ({ value: k, label: k }))}
            />
            <Select
              label="Aggregation"
              value={form.aggregation}
              onChange={(e) => setForm({ ...form, aggregation: e.target.value })}
              options={[
                { value: "AVG", label: "Average" },
                { value: "SUM", label: "Sum" },
                { value: "EOP", label: "End of period" },
              ]}
            />

            <label className="flex items-center gap-2 text-small text-ink">
              <input
                type="checkbox"
                checked={form.isNominal}
                onChange={(e) => setForm({ ...form, isNominal: e.target.checked })}
              />
              This is in current dollars
            </label>

            {form.isNominal ? (
              <Select
                label="Deflator"
                value={form.deflatorSlug}
                onChange={(e) => setForm({ ...form, deflatorSlug: e.target.value })}
                options={[
                  { value: "CPIAUCSL", label: "CPI, All Items" },
                  { value: "GDPDEF", label: "GDP Deflator" },
                  { value: "PCEPI", label: "PCE Price Index" },
                ]}
              />
            ) : null}

            <Select
              label="Population for per capita"
              value={form.populationSlug}
              onChange={(e) => setForm({ ...form, populationSlug: e.target.value })}
              options={[
                { value: "", label: "None" },
                { value: "POPTHM", label: "Population, Monthly" },
                { value: "B230RC0Q173SBEA", label: "Population, Quarterly" },
              ]}
            />

            <Select
              label="Category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              options={flatten(categories).map((c) => ({ value: c.id, label: c.name }))}
            />

            <Button variant="primary" disabled={busy} onClick={() => void commit()}>
              Import {usableRows} valid rows
            </Button>
          </section>
        </>
      ) : null}

      {committed ? (
        <p className="text-body text-ink">
          Imported.{" "}
          <Link href={`/dashboard?s=${committed}`} className="text-accent underline">
            Plot it now
          </Link>
          .
        </p>
      ) : null}
    </main>
  );
}

function flatten(nodes: CategoryNodeDto[]): CategoryNodeDto[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
