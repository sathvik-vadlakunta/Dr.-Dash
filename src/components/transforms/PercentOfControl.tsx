"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SeriesListItem } from "@/types";

/**
 * Section 15.1 item 5. A combobox with search over eligible denominators only,
 * because offering a rate and then refusing it teaches nothing.
 */

export interface PercentOfControlProps {
  value: string | null;
  enabled: boolean;
  reason?: string;
  onChange: (slug: string | null) => void;
}

export function PercentOfControl({ value, enabled, reason, onChange }: PercentOfControlProps) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<SeriesListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/series?role=denominator&q=${encodeURIComponent(query.trim())}&limit=10`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { data: SeriesListItem[] };
        setCandidates(body.data);
      } catch {
        // An aborted search is the expected outcome of typing another letter.
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, enabled]);

  const listId = useMemo(() => "percent-of-options", []);

  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Ratio</span>
      <Tooltip content={enabled ? null : reason}>
        <div className="flex w-full flex-col gap-1">
          <label htmlFor="percent-of" className="text-small font-medium text-ink">
            Show as percent of...
          </label>
          <input
            id="percent-of"
            list={listId}
            value={value ?? query}
            disabled={!enabled}
            aria-disabled={!enabled}
            placeholder="Search a denominator"
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              // Picking from the datalist fires a change with the exact value,
              // so an exact match applies immediately.
              const match = candidates.find((c) => c.slug === next || c.shortLabel === next);
              if (match) onChange(match.slug);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Typing a slug and pressing Enter has to work even though the
              // search results arrive after the last keystroke.
              const typed = query.trim();
              const match =
                candidates.find((c) => c.slug === typed || c.shortLabel === typed) ??
                candidates[0];
              if (match) onChange(match.slug);
            }}
            onBlur={() => {
              const typed = query.trim();
              if (typed === "" || value === typed) return;
              const match = candidates.find((c) => c.slug === typed || c.shortLabel === typed);
              if (match) onChange(match.slug);
            }}
            className="h-[36px] rounded-control border border-rule-strong bg-surface px-3 font-mono text-data text-ink disabled:opacity-50"
          />
          <datalist id={listId}>
            {candidates.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.shortLabel}
              </option>
            ))}
          </datalist>
          {loading ? <p className="text-small text-ink-muted">Searching…</p> : null}
        </div>
      </Tooltip>

      {value ? (
        <Button
          variant="ghost"
          className="self-start px-2"
          onClick={() => {
            setQuery("");
            onChange(null);
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

export default PercentOfControl;
