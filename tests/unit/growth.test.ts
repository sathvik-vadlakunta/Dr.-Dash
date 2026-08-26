import { describe, expect, it } from "vitest";
import { applyGrowth } from "@/lib/series/growth";
import { M_RATE, Q_LEVEL, mk } from "../fixtures/series";

/**
 * Section 22.1, growth.test.ts. Every number here is the contract.
 */

function at(points: Array<{ date: string; value: number | null }>, date: string) {
  return points.find((p) => p.date === date)?.value ?? null;
}

describe("year over year", () => {
  const out = applyGrowth(Q_LEVEL, "YOY");

  it("is 10 at 2020-01-01", () => {
    expect(at(out.points, "2020-01-01")).toBeCloseTo(10, 6);
  });

  it("is 10.784314 at 2020-04-01", () => {
    expect(at(out.points, "2020-04-01")).toBeCloseTo(10.784314, 6);
  });

  it("is 11.538462 at 2020-07-01", () => {
    expect(at(out.points, "2020-07-01")).toBeCloseTo(11.538462, 6);
  });

  it("is 12.264151 at 2020-10-01", () => {
    expect(at(out.points, "2020-10-01")).toBeCloseTo(12.264151, 6);
  });

  it("is null at 2019-01-01, where there is no prior year", () => {
    expect(at(out.points, "2019-01-01")).toBeNull();
  });

  it("reports a percent", () => {
    expect(out.valueKind).toBe("PERCENT");
    expect(out.units).toBe("Percent change from year ago");
  });
});

describe("period over period", () => {
  it("is 2 at 2019-04-01", () => {
    const out = applyGrowth(Q_LEVEL, "POP");
    expect(at(out.points, "2019-04-01")).toBeCloseTo(2, 6);
    expect(out.units).toBe("Percent change from previous period");
  });

  it("annualizes to 8.243216 at 2019-04-01", () => {
    const out = applyGrowth(Q_LEVEL, "POP_ANNUALIZED");
    expect(at(out.points, "2019-04-01")).toBeCloseTo(8.243216, 6);
    expect(out.units).toBe("Percent change, annualized");
  });
});

describe("rate series use a percentage point difference", () => {
  it("is 11.1 percentage points at 2020-04-01", () => {
    const out = applyGrowth(M_RATE, "YOY");

    expect(at(out.points, "2020-04-01")).toBeCloseTo(11.1, 6);
    expect(out.valueKind).toBe("PERCENTAGE_POINTS");
    expect(out.units).toBe("Change from year ago, percentage points");
  });

  it("uses the difference form for an already-percent result too", () => {
    const percentResult = applyGrowth(Q_LEVEL, "YOY");
    const twice = applyGrowth(
      { ...Q_LEVEL, points: percentResult.points },
      "POP",
      percentResult.valueKind,
    );
    expect(twice.valueKind).toBe("PERCENTAGE_POINTS");
  });
});

describe("degenerate cases", () => {
  it("is null, not Infinity, when the prior value is zero", () => {
    const s = mk("Z", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2019-01-01", 0],
      ["2019-04-01", 50],
    ]);
    expect(at(applyGrowth(s, "POP").points, "2019-04-01")).toBeNull();
  });

  it("is null when the previous element is null, rather than skipping over it", () => {
    const s = mk("N", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2019-01-01", 100],
      ["2019-04-01", null],
      ["2019-07-01", 120],
    ]);
    expect(at(applyGrowth(s, "POP").points, "2019-07-01")).toBeNull();
  });

  it("is null and warns when annualizing across a sign change", () => {
    const s = mk("S", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2019-01-01", 100],
      ["2019-04-01", -50],
    ]);
    const out = applyGrowth(s, "POP_ANNUALIZED");

    expect(at(out.points, "2019-04-01")).toBeNull();
    expect(out.warnings).toContain("Annualized growth undefined for sign changes.");
  });

  it("uses the ratio form for an index", () => {
    const s = mk("I", "MONTHLY", "INDEX", 1, [
      ["2019-01-01", 100],
      ["2020-01-01", 105],
    ]);
    const out = applyGrowth(s, "YOY");

    expect(at(out.points, "2020-01-01")).toBeCloseTo(5, 6);
    expect(out.valueKind).toBe("PERCENT");
  });

  it("looks a year back by date, not by array position", () => {
    // A gap year means 2021 has no 2020 counterpart, so it is null rather than
    // being compared against 2019.
    const s = mk("G", "ANNUAL", "LEVEL_CURRENCY", 1e9, [
      ["2019-01-01", 100],
      ["2021-01-01", 121],
    ]);
    expect(at(applyGrowth(s, "YOY").points, "2021-01-01")).toBeNull();
  });
});
