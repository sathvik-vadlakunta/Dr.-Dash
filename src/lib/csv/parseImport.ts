import Papa from "papaparse";
import type { Frequency, Point } from "@/lib/series/types";

/**
 * Section 9.3. A labor economist or a public finance instructor has to be able
 * to bring their own series, so the importer is deliberately forgiving about
 * how a date or a number is written and deliberately strict about telling the
 * user, by row number, what it could not read.
 */

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 10_000;
export const MIN_USABLE_ROWS = 4;

export type IssueCode =
  | "UNPARSEABLE_DATE"
  | "DUPLICATE_DATE"
  | "UNPARSEABLE_VALUE"
  | "DATE_OUT_OF_RANGE"
  | "TOO_FEW_ROWS"
  | "NO_DATE_COLUMN"
  | "NO_VALUE_COLUMN"
  | "TOO_MANY_ROWS";

export interface ImportIssue {
  row: number | null;
  column?: string;
  code: IssueCode;
  message: string;
}

export interface ParsedColumn {
  header: string;
  points: Point[];
  /** Set when at least one cell carried a `%` suffix. */
  looksLikeRate: boolean;
}

export interface ParsedImport {
  columns: ParsedColumn[];
  frequency: Frequency | null;
  issues: ImportIssue[];
  rowCount: number;
  preview: Array<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_START = (y: number, m: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;

/**
 * Section 9.3's table. Everything normalizes to a period start, because that is
 * the only date an `Observation` may carry (Section 5.2 invariant 1).
 */
export function parseImportDate(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;

  // 2020-03-01 or 2020-03-15 -> monthly period start
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const [, y, m] = iso;
    return MONTH_START(Number(y), Number(m));
  }

  // 2020-03 -> monthly
  const yearMonth = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (yearMonth) {
    const [, y, m] = yearMonth;
    const month = Number(m);
    if (month < 1 || month > 12) return null;
    return MONTH_START(Number(y), month);
  }

  // 2020Q2, 2020-Q2, Q2 2020, 2020 Q2
  const quarter =
    /^(\d{4})[-\s]?Q([1-4])$/i.exec(text) ?? /^Q([1-4])[-\s]?(\d{4})$/i.exec(text);
  if (quarter) {
    const isYearFirst = /^\d{4}/.test(text);
    const year = Number(isYearFirst ? quarter[1] : quarter[2]);
    const q = Number(isYearFirst ? quarter[2] : quarter[1]);
    return MONTH_START(year, (q - 1) * 3 + 1);
  }

  // 2020 -> annual
  if (/^\d{4}$/.test(text)) return MONTH_START(Number(text), 1);

  // 3/15/2020 -> US month/day/year, normalized to the month start
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) {
    const [, m, , y] = us;
    const month = Number(m);
    if (month < 1 || month > 12) return null;
    return MONTH_START(Number(y), month);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const NULL_TOKENS = new Set(["", "na", "n/a", "-", "."]);

export interface ParsedValue {
  value: number | null;
  /** True when the cell carried a `%`, which hints at a RATE_PERCENT series. */
  percent: boolean;
  ok: boolean;
}

export function parseImportValue(raw: string): ParsedValue {
  const text = raw.trim();
  if (NULL_TOKENS.has(text.toLowerCase())) return { value: null, percent: false, ok: true };

  const percent = text.includes("%");
  const cleaned = text.replace(/[$,%\s]/g, "");
  if (cleaned === "") return { value: null, percent, ok: true };

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: null, percent, ok: false };
  return { value: n, percent, ok: true };
}

// ---------------------------------------------------------------------------
// Frequency inference
// ---------------------------------------------------------------------------

function monthsBetween(a: string, b: string): number {
  const ay = Number(a.slice(0, 4));
  const am = Number(a.slice(5, 7));
  const by = Number(b.slice(0, 4));
  const bm = Number(b.slice(5, 7));
  return (by - ay) * 12 + (bm - am);
}

function daysBetween(a: string, b: string): number {
  const parse = (s: string) =>
    Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

/**
 * Section 9.3: the modal spacing decides, and it has to hold for at least 80%
 * of the gaps. A file that cannot make up its mind is reported rather than
 * guessed at.
 */
export function inferFrequency(dates: string[]): Frequency | null {
  if (dates.length < 2) return null;

  const monthGaps: number[] = [];
  const dayGaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const previous = dates[i - 1];
    const current = dates[i];
    if (!previous || !current) continue;
    monthGaps.push(monthsBetween(previous, current));
    dayGaps.push(daysBetween(previous, current));
  }
  if (monthGaps.length === 0) return null;

  const share = (gaps: number[], value: number) =>
    gaps.filter((g) => g === value).length / gaps.length;

  if (share(monthGaps, 1) >= 0.8) return "MONTHLY";
  if (share(monthGaps, 3) >= 0.8) return "QUARTERLY";
  if (share(monthGaps, 12) >= 0.8) return "ANNUAL";
  if (share(dayGaps, 7) >= 0.8) return "WEEKLY";
  if (share(dayGaps, 1) >= 0.8) return "DAILY";
  return null;
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

const DATE_HEADERS = ["date", "observation_date", "period", "time", "month", "quarter", "year"];

function findDateColumn(headers: string[]): string | null {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of DATE_HEADERS) {
    const index = lowered.indexOf(candidate);
    if (index >= 0) return headers[index] ?? null;
  }
  // Fall back to the first column, which is where a date almost always is.
  return headers[0] ?? null;
}

export function parseImportCsv(text: string): ParsedImport {
  const issues: ImportIssue[] = [];
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = (parsed.meta.fields ?? []).filter((h) => h.length > 0);
  const rows = parsed.data;

  if (headers.length === 0) {
    issues.push({ row: null, code: "NO_DATE_COLUMN", message: "The file has no header row." });
    return { columns: [], frequency: null, issues, rowCount: 0, preview: [] };
  }

  const dateColumn = findDateColumn(headers);
  if (!dateColumn) {
    issues.push({ row: null, code: "NO_DATE_COLUMN", message: "No date column was found." });
    return { columns: [], frequency: null, issues, rowCount: rows.length, preview: [] };
  }

  const valueColumns = headers.filter((h) => h !== dateColumn);
  if (valueColumns.length === 0) {
    issues.push({
      row: null,
      code: "NO_VALUE_COLUMN",
      message: "The file has a date column but no value column.",
    });
    return { columns: [], frequency: null, issues, rowCount: rows.length, preview: [] };
  }

  if (rows.length > MAX_ROWS) {
    issues.push({
      row: null,
      code: "TOO_MANY_ROWS",
      message: `The file has ${rows.length} rows; the limit is ${MAX_ROWS}.`,
    });
  }

  const seenDates = new Map<string, number>();
  const byColumn = new Map<string, Point[]>(valueColumns.map((c) => [c, []]));
  const percentHint = new Set<string>();
  const orderedDates: string[] = [];

  rows.slice(0, MAX_ROWS).forEach((row, index) => {
    // Row 1 is the header, so the first data row is row 2 to the user.
    const rowNumber = index + 2;
    const rawDate = row[dateColumn] ?? "";
    const date = parseImportDate(rawDate);

    if (!date) {
      issues.push({
        row: rowNumber,
        column: dateColumn,
        code: "UNPARSEABLE_DATE",
        message: `"${rawDate}" is not a date this importer recognises.`,
      });
      return;
    }

    const year = Number(date.slice(0, 4));
    const maxYear = new Date().getUTCFullYear() + 1;
    if (year < 1776 || year > maxYear) {
      issues.push({
        row: rowNumber,
        column: dateColumn,
        code: "DATE_OUT_OF_RANGE",
        message: `${date} is outside 1776 to ${maxYear}.`,
      });
      return;
    }

    const firstSeen = seenDates.get(date);
    if (firstSeen !== undefined) {
      issues.push({
        row: rowNumber,
        column: dateColumn,
        code: "DUPLICATE_DATE",
        message: `${date} already appeared on row ${firstSeen}.`,
      });
      return;
    }
    seenDates.set(date, rowNumber);
    orderedDates.push(date);

    for (const column of valueColumns) {
      const parsedValue = parseImportValue(row[column] ?? "");
      if (!parsedValue.ok) {
        issues.push({
          row: rowNumber,
          column,
          code: "UNPARSEABLE_VALUE",
          message: `"${row[column]}" is not a number.`,
        });
      }
      if (parsedValue.percent) percentHint.add(column);
      byColumn.get(column)?.push({ date, value: parsedValue.value });
    }
  });

  const sortedDates = [...orderedDates].sort();
  const columns: ParsedColumn[] = valueColumns.map((header) => ({
    header,
    points: (byColumn.get(header) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
    looksLikeRate: percentHint.has(header),
  }));

  const usable = columns[0]?.points.filter((p) => p.value !== null).length ?? 0;
  if (usable < MIN_USABLE_ROWS) {
    issues.push({
      row: null,
      code: "TOO_FEW_ROWS",
      message: `A series needs at least ${MIN_USABLE_ROWS} usable rows; this file has ${usable}.`,
    });
  }

  return {
    columns,
    frequency: inferFrequency(sortedDates),
    issues,
    rowCount: sortedDates.length,
    preview: rows.slice(0, 10),
  };
}
