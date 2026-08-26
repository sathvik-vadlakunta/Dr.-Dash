import type { Point } from "@/lib/series/types";

/**
 * Section 14.1. Rendering thousands of SVG points costs frames and shows the
 * reader nothing extra, so the chart draws a reduced set. This is a *rendering*
 * concession only: the tooltip and the CSV export always read the full data.
 *
 * LTTB (largest triangle three buckets) is used rather than plain decimation
 * because it keeps local extrema. Dropping a recession trough because it fell
 * between two sampled points would change what the chart says.
 */

export const DOWNSAMPLE_THRESHOLD = 2000;
export const DOWNSAMPLE_TARGET = 1500;
export const DOWNSAMPLE_FLOOR = 400;

function area(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return Math.abs((ax - cx) * (by - ay) - (ax - bx) * (cy - ay)) / 2;
}

/**
 * `points` must be sorted ascending. Nulls are preserved as bucket boundaries
 * rather than being smoothed over, because a gap in the data is information.
 */
export function lttb(points: Point[], target: number): Point[] {
  if (target >= points.length || target < 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;

  const out: Point[] = [first];
  const bucketSize = (points.length - 2) / (target - 2);

  let previous = first;
  let previousIndex = 0;

  for (let i = 0; i < target - 2; i += 1) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, points.length - 1);

    const nextStart = rangeEnd;
    const nextEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length);

    // The average of the next bucket forms the third corner of the triangle.
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextStart; j < nextEnd; j += 1) {
      const p = points[j];
      if (!p || p.value === null) continue;
      avgX += j;
      avgY += p.value;
      avgCount += 1;
    }
    if (avgCount === 0) {
      avgX = nextStart;
      avgY = previous.value ?? 0;
    } else {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    let best: Point = points[rangeStart] ?? previous;
    let bestIndex = rangeStart;
    let bestArea = -1;

    for (let j = rangeStart; j < rangeEnd; j += 1) {
      const p = points[j];
      if (!p) continue;
      if (p.value === null) {
        // A gap always survives: it is what tells the reader the line stops.
        best = p;
        bestIndex = j;
        bestArea = Number.POSITIVE_INFINITY;
        break;
      }
      const a = area(previousIndex, previous.value ?? 0, j, p.value, avgX, avgY);
      if (a > bestArea) {
        bestArea = a;
        best = p;
        bestIndex = j;
      }
    }

    out.push(best);
    previous = best;
    previousIndex = bestIndex;
  }

  out.push(last);
  return out;
}

/**
 * Section 14.1's policy: downsample only above the threshold, and never when a
 * series is short enough that every point matters.
 */
export function downsampleForRender(points: Point[]): Point[] {
  if (points.length < DOWNSAMPLE_FLOOR) return points;
  if (points.length <= DOWNSAMPLE_THRESHOLD) return points;
  return lttb(points, DOWNSAMPLE_TARGET);
}
