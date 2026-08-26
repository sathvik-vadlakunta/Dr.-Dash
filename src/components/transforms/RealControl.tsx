"use client";

import { Select } from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Section 15.1 item 3. A switch with a visible on/off label, because the
 * transform panel's meaning depends on knowing its state at a glance
 * (Section 20.4).
 */

export interface RealControlProps {
  on: boolean;
  baseYear: number | null;
  deflatorSlug: string | null;
  validBaseYears: number[];
  deflators: Array<{ slug: string; label: string }>;
  enabled: boolean;
  reason?: string;
  onToggle: (on: boolean) => void;
  onBaseYear: (year: number) => void;
  onDeflator: (slug: string) => void;
}

export function RealControl({
  on,
  baseYear,
  deflatorSlug,
  validBaseYears,
  deflators,
  enabled,
  reason,
  onToggle,
  onBaseYear,
  onDeflator,
}: RealControlProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Inflation</span>
      <Tooltip content={enabled ? null : reason}>
        <label
          className={`flex items-center gap-2 text-small ${enabled ? "text-ink" : "text-ink-muted"}`}
        >
          <input
            type="checkbox"
            checked={on}
            aria-disabled={!enabled}
            disabled={!enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Adjust for inflation
          <span className="font-mono text-data text-ink-muted">{on ? "on" : "off"}</span>
        </label>
      </Tooltip>

      {on ? (
        <div className="flex flex-col gap-2 pl-6">
          <Select
            label="Base year"
            value={baseYear ? String(baseYear) : ""}
            onChange={(e) => onBaseYear(Number(e.target.value))}
            options={validBaseYears.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <Select
            label="Deflator"
            value={deflatorSlug ?? ""}
            onChange={(e) => onDeflator(e.target.value)}
            options={deflators.map((d) => ({ value: d.slug, label: d.label }))}
          />
        </div>
      ) : null}
    </div>
  );
}

export default RealControl;
