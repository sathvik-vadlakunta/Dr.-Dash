"use client";

import { useState } from "react";
import { SeriesList } from "@/components/catalog/SeriesList";
import type { CategoryNodeDto, SeriesListItem } from "@/types";

/**
 * Section 9.2 and 16.3. Click a category, it expands and lists its series;
 * click a series, it plots. The tree is the resolved one from Section 9.1, so a
 * user's own renames and additions appear in place of the system defaults.
 */

export interface CategoryTreeProps {
  nodes: CategoryNodeDto[];
  plottedSlugs: string[];
  onPlot: (slug: string) => void;
}

interface NodeProps extends CategoryTreeProps {
  node: CategoryNodeDto;
  depth: number;
}

function CategoryNode({ node, depth, plottedSlugs, onPlot, nodes }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SeriesListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || items !== null) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/series?categoryId=${node.id}&limit=100`);
      if (res.ok) {
        const body = (await res.json()) as { data: SeriesListItem[] };
        setItems(body.data);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        className="flex w-full items-center justify-between gap-2 border-b border-rule py-2 pr-3 text-left hover:bg-surface-sunken"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="font-mono text-data text-ink-muted">
            {open ? "−" : "+"}
          </span>
          <span className="text-small font-medium text-ink">{node.name}</span>
        </span>
        <span className="font-mono text-data text-ink-muted">{node.seriesCount}</span>
      </button>

      {open ? (
        <>
          <SeriesList
            items={items ?? []}
            plottedSlugs={plottedSlugs}
            loading={loading}
            onPlot={onPlot}
          />
          {node.children.length > 0 ? (
            <ul>
              {node.children.map((child) => (
                <CategoryNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  nodes={nodes}
                  plottedSlugs={plottedSlugs}
                  onPlot={onPlot}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function CategoryTree({ nodes, plottedSlugs, onPlot }: CategoryTreeProps) {
  return (
    <ul aria-label="Categories">
      {nodes.map((node) => (
        <CategoryNode
          key={node.id}
          node={node}
          depth={0}
          nodes={nodes}
          plottedSlugs={plottedSlugs}
          onPlot={onPlot}
        />
      ))}
    </ul>
  );
}

export default CategoryTree;
