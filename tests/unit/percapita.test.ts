import { describe, expect, it } from "vitest";
import { applyPerCapita } from "@/lib/series/percapita";
import { isTransformError } from "@/lib/series/types";
import { M_RATE, mk } from "../fixtures/series";

/**
 * Section 22.1, percapita.test.ts.
 */

describe("applyPerCapita", () => {
  it("divides base units by base units", () => {
    // 21000 billions of dollars over 330000 thousands of persons.
    const gdp = mk("X", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 21000]]);
    const pop = mk("POP", "QUARTERLY", "LEVEL_COUNT", 1e3, [["2020-01-01", 330000]], {
      isNominal: false,
      flags: { isPopulation: true },
    });

    const out = applyPerCapita(gdp, pop);

    expect(out.series.points[0]?.value).toBeCloseTo(63636.363636, 6);
    // Section 13.1: a per capita level is already in display units.
    expect(out.displayScale).toBe(1);
    expect(out.units).toBe("Dollars per person");
    expect(out.unitsShort).toBe("$/person");
    expect(out.valueKind).toBe("LEVEL");
  });

  it("keeps the base year in the label after a real transform", () => {
    const gdp = mk("X", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 21000]]);
    const pop = mk("POP", "QUARTERLY", "LEVEL_COUNT", 1e3, [["2020-01-01", 330000]], {
      isNominal: false,
      flags: { isPopulation: true },
    });

    const out = applyPerCapita(gdp, pop, { baseYear: 2017 });

    expect(out.units).toBe("2017 Dollars per person");
    expect(out.unitsShort).toBe("2017 $/person");
  });

  it("refuses a rate series", () => {
    const pop = mk("POP", "MONTHLY", "LEVEL_COUNT", 1e3, [["2020-04-01", 330000]], {
      isNominal: false,
      flags: { isPopulation: true },
    });

    expect(() => applyPerCapita(M_RATE, pop)).toThrowError();

    try {
      applyPerCapita(M_RATE, pop);
    } catch (error) {
      expect(isTransformError(error)).toBe(true);
      if (isTransformError(error)) expect(error.code).toBe("TRANSFORM_NOT_ALLOWED");
    }
  });

  it("is null where population is zero or missing", () => {
    const x = mk("X", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 21000],
      ["2020-04-01", 21500],
    ]);
    const pop = mk(
      "POP",
      "QUARTERLY",
      "LEVEL_COUNT",
      1e3,
      [
        ["2020-01-01", 0],
        ["2020-04-01", null],
      ],
      { isNominal: false, flags: { isPopulation: true } },
    );

    const out = applyPerCapita(x, pop);
    expect(out.series.points[0]?.value).toBeNull();
    expect(out.series.points[1]?.value).toBeNull();
  });

  it("labels a count per person in its own units", () => {
    const houses = mk("H", "MONTHLY", "LEVEL_COUNT", 1e3, [["2020-01-01", 1400]], {
      isNominal: false,
      units: "Thousands of Units",
      unitsShort: "Thous. units",
    });
    const pop = mk("POP", "MONTHLY", "LEVEL_COUNT", 1e3, [["2020-01-01", 330000]], {
      isNominal: false,
      flags: { isPopulation: true },
    });

    const out = applyPerCapita(houses, pop);
    expect(out.units).toBe("Units per person");
    expect(out.series.points[0]?.value).toBeCloseTo(1400 / 330000, 9);
  });
});
