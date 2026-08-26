import { describe, expect, it } from "vitest";
import { applyReal, baseYearMean, validBaseYears } from "@/lib/series/real";
import { isTransformError } from "@/lib/series/types";
import { M_DEFLATOR, M_NOMINAL } from "../fixtures/series";

/**
 * Section 22.1, real.test.ts.
 */

describe("baseYearMean", () => {
  it("averages the deflator over a fully covered year", () => {
    expect(baseYearMean(M_DEFLATOR, 2019)).toBeCloseTo(105.5, 6);
  });

  it("rejects a year the deflator does not fully cover", () => {
    expect(() => baseYearMean(M_DEFLATOR, 2020)).toThrowError(/BASE_YEAR_INCOMPLETE|not fully/i);

    try {
      baseYearMean(M_DEFLATOR, 2020);
    } catch (error) {
      expect(isTransformError(error)).toBe(true);
      if (isTransformError(error)) {
        expect(error.code).toBe("BASE_YEAR_INCOMPLETE");
        // The copy in Section 18 needs the valid range to offer.
        expect(error.details.validBaseYears).toEqual([2019]);
      }
    }
  });
});

describe("validBaseYears", () => {
  it("lists only the fully covered years", () => {
    expect(validBaseYears(M_DEFLATOR)).toEqual([2019]);
  });
});

describe("applyReal", () => {
  it("deflates to the base year's prices", () => {
    const out = applyReal(M_NOMINAL, M_DEFLATOR, 2019);
    const point = out.series.points.find((p) => p.date === "2020-01-01");

    // 200 * 105.5 / 112, expressed at the series' stored-unit scale.
    expect((point?.value ?? 0) / M_NOMINAL.unitMultiplier).toBeCloseTo(188.392857, 6);
  });

  it("labels the result in base-year dollars", () => {
    const out = applyReal(M_NOMINAL, M_DEFLATOR, 2019);

    expect(out.units).toBe("Billions of 2019 Dollars");
    expect(out.unitsShort).toBe("Bil. 2019 $");
    expect(out.valueKind).toBe("LEVEL");
    expect(out.formulaStep).toBe("x TESTD(2019)/TESTD(t)");
  });

  it("is null where the deflator is missing", () => {
    const gappy = {
      ...M_DEFLATOR,
      points: M_DEFLATOR.points.map((p) => (p.date === "2020-01-01" ? { ...p, value: null } : p)),
    };
    const out = applyReal(M_NOMINAL, gappy, 2019);

    expect(out.series.points.find((p) => p.date === "2020-01-01")?.value).toBeNull();
  });
});
