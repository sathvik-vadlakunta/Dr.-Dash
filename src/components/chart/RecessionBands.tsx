import type { RecessionInterval } from "@/types";

/**
 * Section 14.2. The bands themselves are `ReferenceArea` elements inside
 * `SeriesChart`, because Recharts has to own them to place them against the
 * axes. What lives here is their legend entry: colour is never the only
 * channel (Section 21.1.4), so the shading is named in words too.
 */
export interface RecessionBandsProps {
  intervals: RecessionInterval[];
  visible: boolean;
}

export function RecessionBands({ intervals, visible }: RecessionBandsProps) {
  if (!visible || intervals.length === 0) return null;

  return (
    <p className="flex items-center gap-2 text-small text-ink-muted">
      <span
        aria-hidden
        className="inline-block h-3 w-6 border border-rule"
        style={{ background: "var(--band)" }}
      />
      <span>
        Shaded: {intervals.length} NBER recession{intervals.length === 1 ? "" : "s"} in this range
      </span>
    </p>
  );
}

export default RecessionBands;
