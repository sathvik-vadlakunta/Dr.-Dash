import type { ReactNode } from "react";

/**
 * Section 20.3: panels are separated by rules, not shadows, and a table header
 * uses the eyebrow token with a hairline beneath, echoing a statistical table.
 */
export interface TableProps {
  caption?: ReactNode;
  head: ReactNode[];
  rows: ReactNode[][];
  /** Column indices that hold numbers, so they get the mono face and align right. */
  numericColumns?: number[];
}

export function Table({ caption, head, rows, numericColumns = [] }: TableProps) {
  const numeric = new Set(numericColumns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-small">
        {caption ? (
          <caption className="pb-2 text-left text-small text-ink-muted">{caption}</caption>
        ) : null}
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th
                key={i}
                scope="col"
                className={[
                  "eyebrow border-b border-rule px-3 py-2",
                  numeric.has(i) ? "text-right" : "text-left",
                ].join(" ")}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-rule last:border-b-0">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={[
                    "px-3 py-2",
                    numeric.has(c) ? "text-right font-mono text-data" : "text-ink",
                  ].join(" ")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
