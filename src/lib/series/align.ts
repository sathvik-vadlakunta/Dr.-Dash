import type { Frequency, Point, SeriesData } from "@/lib/series/types";

/**
 * Section 6.3. Alignment happens only when two series must be combined. A
 * single series taking a growth rate is never re-sampled.
 *
 * All period arithmetic here is done on ISO strings rather than `Date`
 * objects, because a `Date` carries a timezone and a timezone can move an
 * observation into the wrong period.
 */

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  DAILY: 365,
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUAL: 1,
};

export const FREQ_RANK: Record<Frequency, number> = {
  DAILY: 5,
  WEEKLY: 4,
  MONTHLY: 3,
  QUARTERLY: 2,
  ANNUAL: 1,
};

/** A series carrying whatever the alignment had to warn about. */
export interface AlignedSeries extends SeriesData {
  warnings: string[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** The start of the `target` period that `date` falls inside. */
export function periodStart(date: string, target: Frequency): string {
  const y = yearOf(date);
  const m = monthOf(date);
  switch (target) {
    case "ANNUAL":
      return `${y}-01-01`;
    case "QUARTERLY":
      return `${y}-${pad2(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
    case "MONTHLY":
      return `${y}-${pad2(m)}-01`;
    case "WEEKLY":
    case "DAILY":
      return date;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOf(date: string): number {
  const y = yearOf(date);
  const m = monthOf(date);
  const d = Number(date.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** How many `weekStartDay` weekdays fall in the months `[from, to]` of `year`. */
function countWeekStarts(year: number, fromMonth: number, toMonth: number, weekStartDay: number): number {
  let count = 0;
  for (let m = fromMonth; m <= toMonth; m += 1) {
    const days = daysInMonth(year, m);
    for (let d = 1; d <= days; d += 1) {
      if (new Date(Date.UTC(year, m - 1, d)).getUTCDay() === weekStartDay) count += 1;
    }
  }
  return count;
}

/**
 * Section 6.3 rule 4. How many source observations a complete target period
 * should contain. A weekly source needs to know which weekday its periods
 * start on, which `alignTo` infers from the data.
 */
export function expectedPeriodCount(
  source: Frequency,
  target: Frequency,
  targetPeriodStart: string,
  weekStartDay = 0,
): number {
  if (source === target) return 1;
  // A daily source is accepted with whatever is present.
  if (source === "DAILY") return 1;

  const year = yearOf(targetPeriodStart);
  const month = monthOf(targetPeriodStart);

  if (source === "MONTHLY") {
    if (target === "QUARTERLY") return 3;
    if (target === "ANNUAL") return 12;
  }
  if (source === "QUARTERLY" && target === "ANNUAL") return 4;

  if (source === "WEEKLY") {
    if (target === "MONTHLY") return countWeekStarts(year, month, month, weekStartDay);
    if (target === "QUARTERLY") return countWeekStarts(year, month, month + 2, weekStartDay);
    if (target === "ANNUAL") return countWeekStarts(year, 1, 12, weekStartDay);
  }

  return 1;
}

function aggregate(values: Array<number | null>, how: SeriesData["aggregation"]): number | null {
  // Section 6.3 rule 5: any null inside a complete period makes the aggregate null.
  if (values.some((v) => v === null)) return null;
  const nums = values as number[];
  if (nums.length === 0) return null;

  switch (how) {
    case "SUM":
      return nums.reduce((a, b) => a + b, 0);
    case "EOP":
      return nums[nums.length - 1] ?? null;
    case "AVG":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
}

/** The modal weekday of a weekly series' period starts. */
function inferWeekStartDay(points: Point[]): number {
  const counts = new Array<number>(7).fill(0);
  for (const p of points) {
    const day = weekdayOf(p.date);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  let best = 0;
  for (let i = 1; i < 7; i += 1) {
    if ((counts[i] ?? 0) > (counts[best] ?? 0)) best = i;
  }
  return best;
}

/**
 * Down-sample `series` to `target`. Section 6.3 rule 6: upsampling is never
 * performed, so a request to move to a finer frequency returns the series
 * unchanged.
 */
export function alignTo(series: SeriesData, target: Frequency): AlignedSeries {
  if (series.frequency === target) {
    return { ...series, warnings: [] };
  }
  if (FREQ_RANK[target] > FREQ_RANK[series.frequency]) {
    // The target is finer than the source. Never upsample.
    return { ...series, warnings: [] };
  }

  const weekStartDay =
    series.frequency === "WEEKLY" ? inferWeekStartDay(series.points) : 0;

  const buckets = new Map<string, Array<number | null>>();
  const order: string[] = [];
  for (const p of series.points) {
    const key = periodStart(p.date, target);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(p.value);
  }

  const warnings: string[] = [];
  // Rule 4: coverage only has to be complete for calendar targets.
  const checksCoverage = target === "MONTHLY" || target === "QUARTERLY" || target === "ANNUAL";

  const points: Point[] = order.map((date) => {
    const values = buckets.get(date) ?? [];
    if (checksCoverage) {
      const expected = expectedPeriodCount(series.frequency, target, date, weekStartDay);
      if (values.length !== expected) {
        if (warnings.length === 0) {
          // Once per transform, not once per period.
          warnings.push(`Incomplete period dropped: ${date}`);
        }
        return { date, value: null };
      }
    }
    return { date, value: aggregate(values, series.aggregation) };
  });

  return { ...series, frequency: target, points, warnings };
}

/** Move both series to the coarser of the two frequencies (rule 2). */
export function alignPair(a: SeriesData, b: SeriesData): [AlignedSeries, AlignedSeries, Frequency] {
  const target = FREQ_RANK[a.frequency] <= FREQ_RANK[b.frequency] ? a.frequency : b.frequency;
  return [alignTo(a, target), alignTo(b, target), target];
}

/** The coarsest frequency among a set of series, which is what a 3-way combination needs. */
export function coarsestFrequency(series: SeriesData[]): Frequency {
  return series.reduce<Frequency>(
    (coarsest, s) => (FREQ_RANK[s.frequency] < FREQ_RANK[coarsest] ? s.frequency : coarsest),
    series[0]?.frequency ?? "ANNUAL",
  );
}

/** Index a series' values by date for exact-date lookups (Section 6.4). */
export function byDate(series: SeriesData): Map<string, number | null> {
  return new Map(series.points.map((p) => [p.date, p.value]));
}
