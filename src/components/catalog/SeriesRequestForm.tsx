"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { ApiErrorBody } from "@/types";

/**
 * Section 9.5. Search FRED itself, pick a candidate, say why you want it. The
 * search is a proxy so a user never needs a FRED key of their own.
 */

interface RemoteCandidate {
  id: string;
  title: string;
  frequency: string;
  units: string;
  observation_start: string;
  observation_end: string;
  popularity: number;
  inDatabase: boolean;
}

export function SeriesRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<RemoteCandidate[] | null>(null);
  const [chosen, setChosen] = useState<RemoteCandidate | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setBusy(true);
    setUnavailable(null);
    try {
      const res = await fetch(
        `/api/v1/series?source=fred-remote&q=${encodeURIComponent(query.trim())}`,
      );
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        // Without a FRED key there is nothing to search, and saying so beats a
        // silent empty list.
        setUnavailable(body.error.message);
        setCandidates([]);
        return;
      }
      const body = (await res.json()) as { data: RemoteCandidate[] };
      setCandidates(body.data);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!chosen) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/series-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fredId: chosen.id, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      toast.show("Requested. An administrator will review it.");
      setChosen(null);
      setNote("");
      setCandidates(null);
      setQuery("");
      onSubmitted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <Field
          label="Search FRED"
          value={query}
          placeholder="state unemployment rate"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <Button variant="primary" disabled={busy} onClick={() => void search()}>
          Search
        </Button>
      </div>

      {unavailable ? <p className="text-small text-warn">{unavailable}</p> : null}

      {candidates && candidates.length > 0 ? (
        <ul className="flex flex-col border border-rule">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={c.inDatabase}
                onClick={() => setChosen(c)}
                className="flex w-full flex-col gap-1 border-b border-rule p-3 text-left last:border-b-0 hover:bg-surface-sunken disabled:opacity-50"
              >
                <span className="text-small text-ink">{c.title}</span>
                <span className="font-mono text-data text-ink-muted">
                  {c.id} · {c.frequency} · {c.units} · {c.observation_start} to{" "}
                  {c.observation_end}
                  {c.inDatabase ? " · already in the catalog" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {chosen ? (
        <div className="flex flex-col gap-3 rounded-card border border-rule p-4">
          <p className="text-small text-ink">
            Requesting <span className="font-mono text-data">{chosen.id}</span> — {chosen.title}
          </p>
          <Field
            label="Why do you need it?"
            value={note}
            hint="Optional, but it helps the reviewer place the series in the right category."
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void submit()}>
              Request this series
            </Button>
            <Button onClick={() => setChosen(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default SeriesRequestForm;
