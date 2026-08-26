"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Section 15.1 item 4. The population override lives behind an Advanced
 * disclosure: almost nobody needs it, and the default is picked from the
 * aligned frequency (Section 6.5.3).
 */

export interface PerCapitaControlProps {
  on: boolean;
  populationSlug: string | null;
  populations: Array<{ slug: string; label: string }>;
  enabled: boolean;
  reason?: string;
  onToggle: (on: boolean) => void;
  onPopulation: (slug: string) => void;
}

export function PerCapitaControl({
  on,
  populationSlug,
  populations,
  enabled,
  reason,
  onToggle,
  onPopulation,
}: PerCapitaControlProps) {
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Population</span>
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
          Per capita
          <span className="font-mono text-data text-ink-muted">{on ? "on" : "off"}</span>
        </label>
      </Tooltip>

      {on ? (
        <div className="pl-6">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className="text-small text-accent underline"
          >
            Advanced
          </button>
          {advanced ? (
            <Select
              label="Population series"
              value={populationSlug ?? ""}
              onChange={(e) => onPopulation(e.target.value)}
              options={populations.map((p) => ({ value: p.slug, label: p.label }))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default PerCapitaControl;
