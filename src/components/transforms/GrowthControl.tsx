"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import type { GrowthMode } from "@/lib/series/types";

/**
 * Section 15.1 item 2. A radio group, not a dropdown: the four choices are the
 * point, and hiding three of them behind a click hides the idea.
 */

export interface GrowthControlProps {
  value: GrowthMode;
  onChange: (mode: GrowthMode) => void;
  enabled: boolean;
  reason?: string;
  /** True when the active series are rates, which change in percentage points. */
  ratesActive: boolean;
}

const OPTIONS: Array<{ value: GrowthMode; label: string }> = [
  { value: "NONE", label: "Level" },
  { value: "YOY", label: "Growth, year over year" },
  { value: "POP", label: "Growth, period over period" },
  { value: "POP_ANNUALIZED", label: "Growth, annualized" },
];

export function GrowthControl({
  value,
  onChange,
  enabled,
  reason,
  ratesActive,
}: GrowthControlProps) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={!enabled}>
      <legend className="eyebrow">Growth</legend>
      <Tooltip content={enabled ? null : reason}>
        <div className="flex flex-col gap-1">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-2 text-small ${enabled ? "text-ink" : "text-ink-muted"}`}
            >
              <input
                type="radio"
                name="growth"
                value={option.value}
                checked={value === option.value}
                aria-disabled={!enabled}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </Tooltip>
      {ratesActive ? (
        <p className="text-small text-ink-muted">
          Rates change in percentage points, not percent.
        </p>
      ) : null}
    </fieldset>
  );
}

export default GrowthControl;
