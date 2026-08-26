"use client";

import { clsx } from "clsx";
import type { PlottedResult } from "@/types";

/**
 * Section 20.5, the signature element. The bar renders the formula chain as
 * monospace chips, and every chip after the first can be removed. It is what
 * makes the brief's central claim visible: the data did not change, the way of
 * looking at it did.
 */

export interface TransformBarProps {
  /** The selected series, or the first one when nothing is selected. */
  result: PlottedResult | null;
  /** True when more than one series is plotted, so the bar says which it shows. */
  showsWhich: boolean;
  onRemoveStep: (stepIndex: number) => void;
  onHoverStep?: (stepIndex: number | null) => void;
}

export function TransformBar({
  result,
  showsWhich,
  onRemoveStep,
  onHoverStep,
}: TransformBarProps) {
  if (!result) return null;

  return (
    <div
      data-testid="transform-bar"
      className="flex h-[44px] w-full items-center gap-2 overflow-x-auto border-y border-rule bg-surface-sunken px-4"
    >
      {result.formulaChain.map((step, index) => (
        <span key={`${step}-${index}`} className="flex shrink-0 items-center gap-2">
          {index > 0 ? (
            <span aria-hidden className="text-ink-muted">
              ›
            </span>
          ) : null}
          <span
            data-testid="transform-chip"
            onMouseEnter={() => onHoverStep?.(index)}
            onMouseLeave={() => onHoverStep?.(null)}
            className={clsx(
              "group inline-flex items-center gap-1 rounded-control border border-rule bg-surface px-2 py-1 font-mono text-data text-ink",
              "transition-[transform,opacity] duration-180 ease-system motion-reduce:transition-none",
            )}
          >
            {step}
            {index > 0 ? (
              <button
                type="button"
                aria-label={`Remove ${step}`}
                onClick={() => onRemoveStep(index)}
                onFocus={() => onHoverStep?.(index)}
                onBlur={() => onHoverStep?.(null)}
                // `opacity`, not `display`, so the control stays in the tab
                // order: Section 21.1.5 requires every interactive element to
                // be reachable from the keyboard, and a hidden button is not.
                className="ml-1 rounded-control px-1 text-ink-muted opacity-0 transition-opacity duration-120 ease-system hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
              >
                ✕
              </button>
            ) : null}
          </span>
        </span>
      ))}

      {showsWhich ? (
        <span className="ml-auto shrink-0 whitespace-nowrap text-small text-ink-muted">
          Showing {result.label}
        </span>
      ) : null}
    </div>
  );
}

export default TransformBar;
