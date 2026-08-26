"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SeriesList } from "@/components/catalog/SeriesList";
import type { SeriesListItem } from "@/types";

/**
 * Section 9.2. Minimum two characters, debounced 250 ms, limit 25. `/` focuses
 * it from anywhere (Section 16.1).
 */

export interface SeriesSearchProps {
  plottedSlugs: string[];
  onPlot: (slug: string) => void;
}

export function SeriesSearch({ plottedSlugs, onPlot }: SeriesSearchProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SeriesListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/series?q=${encodeURIComponent(trimmed)}&limit=25`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const body = (await res.json()) as { data: SeriesListItem[] };
          setItems(body.data);
        }
      } catch {
        // Aborted by the next keystroke.
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="flex flex-col">
      <div className="p-3">
        <label htmlFor="series-search" className="sr-only">
          Search series
        </label>
        <input
          id="series-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search series  /"
          className="h-[36px] w-full rounded-control border border-rule-strong bg-surface px-3 text-small text-ink"
        />
      </div>

      {items !== null ? (
        items.length === 0 && !loading ? (
          <div className="p-3">
            <p className="text-small text-ink-muted">No series match &ldquo;{query.trim()}&rdquo;.</p>
            <Link href="/data/requests" className="text-small text-accent underline">
              Request this series
            </Link>
          </div>
        ) : (
          <SeriesList
            items={items}
            plottedSlugs={plottedSlugs}
            loading={loading}
            onPlot={onPlot}
          />
        )
      ) : null}
    </div>
  );
}

export default SeriesSearch;
