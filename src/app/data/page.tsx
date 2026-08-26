"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Table } from "@/components/ui/Table";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody, CategoryNodeDto, SeriesListItem } from "@/types";

/**
 * Section 16.4. The catalog manager. The brief asks that a user be able to add
 * categories, rename existing ones, and move data between them, so the tree is
 * editable in place and every edit on a built-in category quietly creates that
 * user's own overlay (Section 9.1).
 */

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
const SOURCES = ["fred", "constructed", "user", "org"] as const;

export default function DataPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Data - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <DataManager />
    </ToastProvider>
  );
}

function DataManager() {
  const toast = useToast();
  const [tree, setTree] = useState<CategoryNodeDto[]>([]);
  const [selected, setSelected] = useState<CategoryNodeDto | null>(null);
  const [series, setSeries] = useState<SeriesListItem[]>([]);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    const res = await fetch("/api/v1/categories?tree=1");
    if (!res.ok) return;
    const body = (await res.json()) as { data: CategoryNodeDto[] };
    setTree(body.data);
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadSeries = useCallback(async () => {
    const query = new URLSearchParams({ limit: "100" });
    if (selected) query.set("categoryId", selected.id);
    if (frequency) query.set("frequency", frequency);
    if (source) query.set("source", source);

    const res = await fetch(`/api/v1/series?${query.toString()}`);
    if (!res.ok) return;
    const body = (await res.json()) as { data: SeriesListItem[] };
    setSeries(body.data);
  }, [selected, frequency, source]);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  async function call(path: string, init: RequestInit): Promise<boolean> {
    const res = await fetch(path, init);
    if (res.ok) return true;
    const body = (await res.json()) as ApiErrorBody;
    toast.show(body.error.message, "error");
    return false;
  }

  async function createCategory() {
    if (newName.trim().length === 0) return;
    const ok = await call("/api/v1/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!ok) return;
    setNewName("");
    toast.show("Category added.");
    await loadTree();
  }

  async function rename(id: string) {
    if (renameTo.trim().length === 0) return;
    const ok = await call(`/api/v1/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: renameTo.trim() }),
    });
    setRenaming(null);
    if (!ok) return;
    toast.show("Renamed.");
    await loadTree();
  }

  async function removeCategory(node: CategoryNodeDto) {
    const ok = await call(`/api/v1/categories/${node.id}`, { method: "DELETE" });
    if (!ok) return;
    if (selected?.id === node.id) setSelected(null);
    toast.show("Category deleted.");
    await loadTree();
  }

  /** Dropping a series onto a category moves it there (Section 9.1). */
  async function dropOnto(node: CategoryNodeDto) {
    if (!dragging) return;
    const seriesRow = series.find((s) => s.slug === dragging);
    setDragging(null);
    if (!seriesRow) return;

    const added = await call(`/api/v1/categories/${node.id}/series`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesId: await seriesIdFor(seriesRow.slug) }),
    });
    if (!added) return;

    toast.show(`${seriesRow.shortLabel} moved to ${node.name}.`);
    await loadTree();
    await loadSeries();
  }

  async function removeFromCategory(slug: string) {
    if (!selected) return;
    const id = await seriesIdFor(slug);
    const ok = await call(`/api/v1/categories/${selected.id}/series?seriesId=${id}`, {
      method: "DELETE",
    });
    if (!ok) return;
    toast.show("Removed from this category. The series itself is untouched.");
    await loadTree();
    await loadSeries();
  }

  const flat = flatten(tree);

  return (
    <main className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[320px_1fr]">
      <section aria-label="Categories" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-display-m">Data</h1>
          <div className="flex gap-2">
            <Link href="/data/import" className="text-small text-accent underline">
              Import CSV
            </Link>
            <Link href="/data/requests" className="text-small text-accent underline">
              Request a series
            </Link>
          </div>
        </div>

        <ul className="border border-rule">
          <li>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-pressed={selected === null}
              className={`flex w-full justify-between border-b border-rule px-3 py-2 text-left text-small ${
                selected === null ? "bg-surface-sunken font-medium" : ""
              }`}
            >
              All series
            </button>
          </li>
          {flat.map(({ node, depth }) => (
            <li
              key={node.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void dropOnto(node)}
            >
              {renaming === node.id ? (
                <div className="flex items-end gap-2 border-b border-rule p-2">
                  <Field
                    label="New name"
                    value={renameTo}
                    autoFocus
                    onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void rename(node.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                  <Button variant="primary" onClick={() => void rename(node.id)}>
                    Rename
                  </Button>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between gap-2 border-b border-rule pr-2"
                  style={{ paddingLeft: `${12 + depth * 12}px` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(node)}
                    aria-pressed={selected?.id === node.id}
                    className={`flex-1 py-2 text-left text-small ${
                      selected?.id === node.id ? "font-medium" : ""
                    }`}
                  >
                    {node.name}
                    {node.isOverride ? (
                      <span className="ml-2 font-mono text-data text-ink-muted">yours</span>
                    ) : null}
                  </button>
                  <span className="font-mono text-data text-ink-muted">{node.seriesCount}</span>
                  <Button
                    variant="ghost"
                    className="px-2"
                    onClick={() => {
                      setRenaming(node.id);
                      setRenameTo(node.name);
                    }}
                  >
                    Rename
                  </Button>
                  {node.isSystem ? null : (
                    <Button
                      variant="destructive"
                      className="px-2"
                      onClick={() => void removeCategory(node)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-end gap-2">
          <Field
            label="New category"
            value={newName}
            placeholder="Regional labor markets"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createCategory();
            }}
          />
          <Button variant="primary" onClick={() => void createCategory()}>
            Add
          </Button>
        </div>
      </section>

      <section aria-label="Series" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Frequency</span>
          {FREQUENCIES.map((f) => (
            <Button
              key={f}
              variant={frequency === f ? "primary" : "secondary"}
              className="px-2"
              onClick={() => setFrequency(frequency === f ? null : f)}
            >
              {f[0] + f.slice(1).toLowerCase()}
            </Button>
          ))}
          <span className="eyebrow ml-4">Source</span>
          {SOURCES.map((s) => (
            <Button
              key={s}
              variant={source === s ? "primary" : "secondary"}
              className="px-2"
              onClick={() => setSource(source === s ? null : s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {series.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing in this category yet.</p>
        ) : (
          <Table
            head={["Series", "Slug", "Frequency", "Units", ""]}
            rows={series.map((s) => [
              <span
                key={`${s.slug}-label`}
                draggable
                onDragStart={() => setDragging(s.slug)}
                onDragEnd={() => setDragging(null)}
                title="Drag onto a category to add it there"
                className="cursor-grab"
              >
                {s.shortLabel}
              </span>,
              <span key={`${s.slug}-slug`} className="font-mono text-data">
                {s.slug}
              </span>,
              s.frequency,
              s.unitsShort,
              selected ? (
                <Button
                  key={`${s.slug}-remove`}
                  variant="ghost"
                  className="px-2"
                  onClick={() => void removeFromCategory(s.slug)}
                >
                  Remove
                </Button>
              ) : (
                <Link key={`${s.slug}-plot`} href={`/dashboard?s=${s.slug}`} className="text-accent underline">
                  Plot
                </Link>
              ),
            ])}
          />
        )}
      </section>
    </main>
  );
}

function flatten(
  nodes: CategoryNodeDto[],
  depth = 0,
): Array<{ node: CategoryNodeDto; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

/** The link endpoints address a series by id; the catalog list returns slugs. */
async function seriesIdFor(slug: string): Promise<string> {
  const res = await fetch(`/api/v1/series/${slug}`);
  if (!res.ok) throw new Error(`${slug} is not available.`);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}
