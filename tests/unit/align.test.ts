import { describe, expect, it } from "vitest";
import { alignPair, alignTo, expectedPeriodCount, periodStart } from "@/lib/series/align";
import { mk } from "../fixtures/series";

/**
 * Section 22.1, align.test.ts.
 */

const Q1_MONTHS: Array<[string, number | null]> = [
  ["2020-01-01", 100],
  ["2020-02-01", 110],
  ["2020-03-01", 120],
];

describe("alignTo", () => {
  it("averages a complete quarter", () => {
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, Q1_MONTHS);
    const out = alignTo(s, "QUARTERLY");

    expect(out.frequency).toBe("QUARTERLY");
    expect(out.points).toHaveLength(1);
    expect(out.points[0]?.date).toBe("2020-01-01");
    expect(out.points[0]?.value).toBeCloseTo(110, 6);
  });

  it("sums a complete quarter when the series aggregates by SUM", () => {
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, Q1_MONTHS, { aggregation: "SUM" });
    expect(alignTo(s, "QUARTERLY").points[0]?.value).toBeCloseTo(330, 6);
  });

  it("takes the last value of a complete quarter when the series is end of period", () => {
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, Q1_MONTHS, { aggregation: "EOP" });
    expect(alignTo(s, "QUARTERLY").points[0]?.value).toBeCloseTo(120, 6);
  });

  it("emits null and warns once when a period is incompletely covered", () => {
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 100],
      ["2020-02-01", 110],
      // March is absent: 2 of the 3 months the quarter needs.
      ["2020-04-01", 130],
      ["2020-05-01", 140],
      ["2020-06-01", 150],
    ]);
    const out = alignTo(s, "QUARTERLY");

    expect(out.points[0]?.date).toBe("2020-01-01");
    expect(out.points[0]?.value).toBeNull();
    expect(out.points[1]?.value).toBeCloseTo(140, 6);

    // Section 6.3 rule 4: once per transform, not once per period.
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain("Incomplete period dropped");
  });

  it("propagates a null inside an otherwise complete period", () => {
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 100],
      ["2020-02-01", null],
      ["2020-03-01", 120],
    ]);
    const out = alignTo(s, "QUARTERLY");

    expect(out.points[0]?.value).toBeNull();
    // Coverage was complete, so this is not an "incomplete period" warning.
    expect(out.warnings).toHaveLength(0);
  });

  it("never upsamples", () => {
    const q = mk("Q", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 100],
      ["2020-04-01", 200],
    ]);
    const out = alignTo(q, "MONTHLY");

    expect(out.frequency).toBe("QUARTERLY");
    expect(out.points).toHaveLength(2);
  });

  it("does nothing when the target frequency already matches", () => {
    const q = mk("Q", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 100]]);
    const out = alignTo(q, "QUARTERLY");

    expect(out.frequency).toBe("QUARTERLY");
    expect(out.points).toEqual(q.points);
    expect(out.warnings).toEqual([]);
  });

  it("aggregates twelve months into a year", () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return [`2020-${month}-01`, 100] as [string, number];
    });
    const s = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, rows);
    const out = alignTo(s, "ANNUAL");

    expect(out.points).toHaveLength(1);
    expect(out.points[0]?.date).toBe("2020-01-01");
    expect(out.points[0]?.value).toBeCloseTo(100, 6);
  });
});

describe("alignPair", () => {
  it("moves both series to the coarser frequency", () => {
    const m = mk("M", "MONTHLY", "LEVEL_CURRENCY", 1e9, Q1_MONTHS);
    const q = mk("Q", "QUARTERLY", "INDEX", 1, [["2020-01-01", 50]]);

    const [a, b, target] = alignPair(m, q);

    expect(target).toBe("QUARTERLY");
    expect(a.frequency).toBe("QUARTERLY");
    expect(b.frequency).toBe("QUARTERLY");
    expect(b.points).toHaveLength(1);
  });
});

describe("period helpers", () => {
  it("maps a date to the start of its target period", () => {
    expect(periodStart("2020-02-17", "QUARTERLY")).toBe("2020-01-01");
    expect(periodStart("2020-11-30", "ANNUAL")).toBe("2020-01-01");
    expect(periodStart("2020-11-30", "MONTHLY")).toBe("2020-11-01");
  });

  it("knows how many source periods a target period needs", () => {
    expect(expectedPeriodCount("MONTHLY", "QUARTERLY", "2020-01-01")).toBe(3);
    expect(expectedPeriodCount("MONTHLY", "ANNUAL", "2020-01-01")).toBe(12);
    expect(expectedPeriodCount("QUARTERLY", "ANNUAL", "2020-01-01")).toBe(4);
    // Section 6.3 rule 4: weekly to monthly expects the number of week starts
    // that actually fall in that month.
    expect(expectedPeriodCount("WEEKLY", "MONTHLY", "2020-03-01")).toBe(5);
    expect(expectedPeriodCount("WEEKLY", "MONTHLY", "2020-02-01")).toBe(4);
    // Daily accepts whatever is present.
    expect(expectedPeriodCount("DAILY", "MONTHLY", "2020-03-01")).toBe(1);
  });
});
