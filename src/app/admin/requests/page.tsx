"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody, CategoryNodeDto } from "@/types";

/**
 * Section 9.6. Nothing is auto-created: the mapped metadata is shown in
 * editable inputs and an administrator confirms it before the series exists.
 * The invariants of Section 5.2 are re-checked on the server, so a bad
 * override is refused rather than written.
 */

interface RequestRow {
  id: string;
  fredId: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user?: { name: string; email: string };
}

const KINDS = ["LEVEL_CURRENCY", "LEVEL_COUNT", "INDEX", "RATE_PERCENT", "RATIO", "FLAG"] as const;

export default function AdminRequestsPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Series requests - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <ApprovalQueue />
    </ToastProvider>
  );
}

function ApprovalQueue() {
  const toast = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [categories, setCategories] = useState<CategoryNodeDto[]>([]);
  const [open, setOpen] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState("");
  const [overrides, setOverrides] = useState({
    shortLabel: "",
    unitsShort: "",
    kind: "" as "" | (typeof KINDS)[number],
    defaultDeflator: "",
    defaultPopulation: "",
    categoryId: "",
  });

  const load = useCallback(async () => {
    const [requestsRes, categoriesRes] = await Promise.all([
      fetch("/api/v1/series-requests?all=1"),
      fetch("/api/v1/categories?tree=1"),
    ]);
    if (requestsRes.ok) {
      const body = (await requestsRes.json()) as { data: RequestRow[] };
      setRows(body.data);
    }
    if (categoriesRes.ok) {
      const body = (await categoriesRes.json()) as { data: CategoryNodeDto[] };
      setCategories(body.data);
      setOverrides((o) => ({ ...o, categoryId: o.categoryId || (body.data[0]?.id ?? "") }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(request: RequestRow, reject: boolean) {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (overrides.shortLabel) patch.shortLabel = overrides.shortLabel;
      if (overrides.unitsShort) patch.unitsShort = overrides.unitsShort;
      if (overrides.kind) patch.kind = overrides.kind;
      if (overrides.defaultDeflator) patch.defaultDeflator = overrides.defaultDeflator;
      if (overrides.defaultPopulation) {
        patch.defaultPopulation = overrides.defaultPopulation;
        patch.canPerCapita = true;
      }

      const res = await fetch(`/api/v1/series-requests/${request.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          reject
            ? { categoryId: overrides.categoryId, reject: true, rejectionReason: rejection }
            : { categoryId: overrides.categoryId, overrides: patch },
        ),
      });

      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      toast.show(reject ? "Request rejected." : "Series added and syncing.");
      setOpen(null);
      setRejection("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  return (
    <main className="mx-auto flex max-w-[80ch] flex-col gap-8 px-4 py-8">
      <h1 className="font-display text-display-m">Approval queue</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-title">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-card border border-rule p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-data text-ink">{r.fredId}</span>
                  <span className="text-small text-ink-muted">
                    {r.user?.name ?? "someone"} · {r.createdAt.slice(0, 10)}
                  </span>
                </div>
                {r.note ? <p className="mt-2 text-small text-ink">{r.note}</p> : null}

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => setOpen(open?.id === r.id ? null : r)}
                    aria-expanded={open?.id === r.id}
                  >
                    Review mapping
                  </Button>
                </div>

                {open?.id === r.id ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-rule pt-4">
                    <p className="text-small text-ink-muted">
                      Leave a field blank to keep what the FRED metadata maps to.
                    </p>
                    <Field
                      label="Short label"
                      maxLength={28}
                      value={overrides.shortLabel}
                      onChange={(e) => setOverrides({ ...overrides, shortLabel: e.target.value })}
                    />
                    <Field
                      label="Units, short"
                      value={overrides.unitsShort}
                      onChange={(e) => setOverrides({ ...overrides, unitsShort: e.target.value })}
                    />
                    <Select
                      label="Kind"
                      value={overrides.kind}
                      onChange={(e) =>
                        setOverrides({
                          ...overrides,
                          kind: e.target.value as (typeof KINDS)[number],
                        })
                      }
                      options={[
                        { value: "", label: "As mapped" },
                        ...KINDS.map((k) => ({ value: k, label: k })),
                      ]}
                    />
                    <Select
                      label="Deflator"
                      value={overrides.defaultDeflator}
                      onChange={(e) =>
                        setOverrides({ ...overrides, defaultDeflator: e.target.value })
                      }
                      options={[
                        { value: "", label: "As mapped" },
                        { value: "CPIAUCSL", label: "CPI, All Items" },
                        { value: "GDPDEF", label: "GDP Deflator" },
                        { value: "PCEPI", label: "PCE Price Index" },
                      ]}
                    />
                    <Select
                      label="Population"
                      value={overrides.defaultPopulation}
                      onChange={(e) =>
                        setOverrides({ ...overrides, defaultPopulation: e.target.value })
                      }
                      options={[
                        { value: "", label: "No per capita" },
                        { value: "POPTHM", label: "Population, Monthly" },
                        { value: "B230RC0Q173SBEA", label: "Population, Quarterly" },
                      ]}
                    />
                    <Select
                      label="Category"
                      value={overrides.categoryId}
                      onChange={(e) => setOverrides({ ...overrides, categoryId: e.target.value })}
                      options={flatten(categories).map((c) => ({ value: c.id, label: c.name }))}
                    />

                    <div className="flex flex-wrap items-end gap-2">
                      <Button variant="primary" disabled={busy} onClick={() => void decide(r, false)}>
                        Approve and sync
                      </Button>
                      <Field
                        label="Reason to reject"
                        value={rejection}
                        onChange={(e) => setRejection(e.target.value)}
                      />
                      <Button
                        variant="destructive"
                        disabled={busy || rejection.trim().length === 0}
                        onClick={() => void decide(r, true)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title">Decided</h2>
        {decided.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {decided.map((r) => (
              <li key={r.id} className="text-small text-ink-muted">
                <span className="font-mono text-data">{r.fredId}</span> · {r.status.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function flatten(nodes: CategoryNodeDto[]): CategoryNodeDto[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
