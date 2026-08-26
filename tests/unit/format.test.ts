import { describe, expect, it } from "vitest";
import { axisTick, formatPeriod, formatValue, legendLabel, yearTickStep } from "@/lib/series/format";

/**
 * Section 22.1, format.test.ts.
 */

describe("formatValue", () => {
  it("renders a percent to one decimal", () => {
    expect(formatValue(4.2831, { valueKind: "PERCENT", displayScale: 1 })).toBe("4.3%");
  });

  it("renders percentage points with an explicit sign", () => {
    expect(formatValue(-1.44, { valueKind: "PERCENTAGE_POINTS", displayScale: 1 })).toBe("-1.4 pp");
    expect(formatValue(1.44, { valueKind: "PERCENTAGE_POINTS", displayScale: 1 })).toBe("+1.4 pp");
  });

  it("renders a scaled currency level with grouping", () => {
    expect(formatValue(21433.2e9, { valueKind: "LEVEL", displayScale: 1e9 })).toBe("21,433.2");
  });

  it("renders per capita dollars with a leading dollar sign and no decimals", () => {
    expect(
      formatValue(63636.36, { valueKind: "LEVEL", displayScale: 1 }, { currency: true }),
    ).toBe("$63,636");
  });

  it("renders an index to one decimal", () => {
    expect(formatValue(128.42, { valueKind: "INDEX", displayScale: 1 })).toBe("128.4");
  });

  it("renders a missing value as n/a", () => {
    expect(formatValue(null, { valueKind: "LEVEL", displayScale: 1 })).toBe("n/a");
  });

  it("uses two decimals for a small level", () => {
    expect(formatValue(4.8123, { valueKind: "LEVEL", displayScale: 1 })).toBe("4.81");
  });
});

describe("axisTick", () => {
  it("goes compact above ten thousand for a level", () => {
    expect(axisTick(21433.2, { valueKind: "LEVEL", displayScale: 1 })).toBe("21.4K");
  });

  it("stays plain below ten thousand", () => {
    expect(axisTick(9999, { valueKind: "LEVEL", displayScale: 1 })).toBe("9,999");
  });

  it("never goes compact for a percent", () => {
    expect(axisTick(12345, { valueKind: "PERCENT", displayScale: 1 })).toBe("12345.0%");
  });
});

describe("legendLabel", () => {
  it("appends suffixes in pipeline order", () => {
    expect(
      legendLabel("Nominal GDP", {
        real: true,
        baseYear: 2017,
        perCapita: true,
        percentOfLabel: null,
        growth: "YOY",
        growthIsPercentagePoints: false,
      }),
    ).toBe("Nominal GDP, real (2017$), per capita, YoY %");
  });

  it("uses the percentage point wording for a rate", () => {
    expect(
      legendLabel("Unemployment Rate", {
        real: false,
        baseYear: null,
        perCapita: false,
        percentOfLabel: null,
        growth: "YOY",
        growthIsPercentagePoints: true,
      }),
    ).toBe("Unemployment Rate, YoY chg (pp)");
  });

  it("names the denominator for a ratio", () => {
    expect(
      legendLabel("Consumption (C)", {
        real: false,
        baseYear: null,
        perCapita: false,
        percentOfLabel: "Nominal GDP",
        growth: "NONE",
        growthIsPercentagePoints: false,
      }),
    ).toBe("Consumption (C), % of Nominal GDP");
  });
});

describe("date formatting", () => {
  it("labels a period by its frequency", () => {
    expect(formatPeriod("2020-04-01", "QUARTERLY")).toBe("2020 Q2");
    expect(formatPeriod("2020-06-01", "MONTHLY")).toBe("Jun 2020");
    expect(formatPeriod("2020-01-01", "ANNUAL")).toBe("2020");
    expect(formatPeriod("2020-06-08", "WEEKLY")).toBe("Week of Jun 8, 2020");
    expect(formatPeriod("2020-06-08", "DAILY")).toBe("Jun 8, 2020");
  });

  it("chooses a year step that keeps the axis under twelve ticks", () => {
    expect(yearTickStep(1947, 2026)).toBe(10);
    expect(yearTickStep(2016, 2026)).toBe(1);
    expect(yearTickStep(1776, 2026)).toBe(25);
  });
});
