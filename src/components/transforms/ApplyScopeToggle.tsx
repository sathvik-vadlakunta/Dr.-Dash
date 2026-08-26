"use client";

import { clsx } from "clsx";

/**
 * Section 6.8. The brief requires transforming every plotted series at once or
 * one at a time, so the scope is a UI switch rather than a data-level one: the
 * URL always stores a spec per series, and the toggle only decides how many of
 * them a control writes to.
 */

export type ApplyScope = "ALL" | "SELECTED";

export interface ApplyScopeToggleProps {
  scope: ApplyScope;
  onChange: (scope: ApplyScope) => void;
  selectionCount: number;
}

export function ApplyScopeToggle({ scope, onChange, selectionCount }: ApplyScopeToggleProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Apply to</span>
      <div
        role="group"
        aria-label="Apply transforms to"
        className="inline-flex rounded-control border border-rule-strong"
      >
        {(["ALL", "SELECTED"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => onChange(value)}
            className={clsx(
              "h-[32px] px-3 text-small transition-colors duration-120 ease-system",
              scope === value ? "bg-accent text-accent-ink" : "bg-transparent text-ink",
            )}
          >
            {value === "ALL" ? "All series" : "Selected"}
          </button>
        ))}
      </div>
      {scope === "SELECTED" && selectionCount === 0 ? (
        <p className="text-small text-ink-muted">Select a series in the legend.</p>
      ) : null}
    </div>
  );
}

export default ApplyScopeToggle;
