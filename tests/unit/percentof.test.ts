import { describe, expect, it } from "vitest";
import { applyPercentOf } from "@/lib/series/percentof";
import { applyTransform } from "@/lib/series/transform";
import { emptyTransform, isTransformError } from "@/lib/series/types";
import { M_RATE, fixtureLoader, mk } from "../fixtures/series";

/**
 * Section 22.1, percentof.test.ts.
 */

const NUMERATOR = mk("N", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 14000]]);
const DENOMINATOR = mk("M", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 21000]]);

describe("applyPercentOf", () => {
  it("divides and scales to a percent", () => {
    const out = applyPercentOf(NUMERATOR, DENOMINATOR);

    expect(out.series.points[0]?.value).toBeCloseTo(66.666667, 6);
    expect(out.valueKind).toBe("PERCENT");
    expect(out.units).toBe("Percent of M");
    expect(out.displayScale).toBe(1);
  });

  it("is null where the denominator is zero", () => {
    const zero = mk("M", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 0]]);
    expect(applyPercentOf(NUMERATOR, zero).series.points[0]?.value).toBeNull();
  });

  it("refuses a rate as a denominator", () => {
    try {
      applyPercentOf(NUMERATOR, M_RATE);
      expect.unreachable("a rate cannot be a denominator");
    } catch (error) {
      expect(isTransformError(error)).toBe(true);
      if (isTransformError(error)) expect(error.code).toBe("DENOMINATOR_NOT_COMPARABLE");
    }
  });

  it("refuses a flag as a denominator", () => {
    const flag = mk("F", "QUARTERLY", "FLAG", 1, [["2020-01-01", 1]]);
    try {
      applyPercentOf(NUMERATOR, flag);
      expect.unreachable("a flag cannot be a denominator");
    } catch (error) {
      if (isTransformError(error)) expect(error.code).toBe("DENOMINATOR_NOT_COMPARABLE");
    }
  });

  it("warns when the denominator changes sign, and still computes", () => {
    const crosses = mk("M", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 21000],
      ["2020-04-01", -100],
    ]);
    const numerator = mk("N", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
      ["2020-01-01", 14000],
      ["2020-04-01", 14000],
    ]);

    const out = applyPercentOf(numerator, crosses);

    expect(out.warnings).toContain("Denominator changes sign; ratio may be misleading.");
    expect(out.series.points[1]?.value).not.toBeNull();
  });
});

describe("through the pipeline", () => {
  it("refuses a real numerator over a denominator that cannot be deflated", () => {
    const deflator = mk("D", "QUARTERLY", "INDEX", 1, [
      ["2020-01-01", 100],
      ["2020-04-01", 100],
      ["2020-07-01", 100],
      ["2020-10-01", 100],
    ]);
    const index = mk("IDX", "QUARTERLY", "INDEX", 1, [["2020-01-01", 120]]);
    const numerator = mk("N", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [["2020-01-01", 14000]]);

    return expect(
      applyTransform(
        numerator,
        {
          ...emptyTransform(),
          real: true,
          baseYear: 2020,
          deflatorSlug: "D",
          percentOfSlug: "IDX",
        },
        fixtureLoader(deflator, index),
      ),
    ).rejects.toMatchObject({ code: "DENOMINATOR_NOT_COMPARABLE" });
  });

  it("drops per capita when a ratio is requested, with one warning", async () => {
    const pop = mk("POP", "QUARTERLY", "LEVEL_COUNT", 1e3, [["2020-01-01", 330000]], {
      isNominal: false,
      flags: { isPopulation: true },
    });

    const out = await applyTransform(
      NUMERATOR,
      {
        ...emptyTransform(),
        perCapita: true,
        populationSlug: "POP",
        percentOfSlug: "M",
      },
      fixtureLoader(DENOMINATOR, pop),
    );

    expect(out.effectiveSpec.perCapita).toBe(false);
    expect(out.warnings).toEqual(["Per capita has no effect on a ratio; it was ignored."]);
    expect(out.points[0]?.value).toBeCloseTo(66.666667, 6);
  });
});
