import { describe, expect, it } from "vitest";
import { applyTransform } from "@/lib/series/transform";
import { emptyTransform } from "@/lib/series/types";
import { P_D, P_P, P_X, fixtureLoader } from "../fixtures/series";

/**
 * Section 22.1, transform-pipeline.test.ts. The pipeline order is the product:
 * real, then per capita, then percent of, then growth. Growth is always last,
 * because a growth rate has to be taken of whatever level the user finally
 * chose to look at.
 */

const loader = fixtureLoader(P_D, P_P, P_X);

const FULL = {
  ...emptyTransform(),
  real: true,
  baseYear: 2019,
  deflatorSlug: "PD",
  perCapita: true,
  populationSlug: "PP",
  growth: "YOY" as const,
};

function at(points: Array<{ date: string; value: number | null }>, date: string) {
  return points.find((p) => p.date === date)?.value ?? null;
}

describe("real, per capita, growth", () => {
  it("deflates exactly away the nominal rise", async () => {
    const out = await applyTransform(P_X, { ...FULL, perCapita: false, growth: "NONE" }, loader);

    // The deflator rose 10% and so did X, so the real level is flat at 100.
    expect((at(out.points, "2020-01-01") ?? 0) / P_X.unitMultiplier).toBeCloseTo(100, 6);
  });

  it("divides by population into dollars per person", async () => {
    const out = await applyTransform(P_X, { ...FULL, growth: "NONE" }, loader);

    // 100e9 dollars over 1e6 persons.
    expect(at(out.points, "2019-01-01")).toBeCloseTo(100000, 6);
    expect(out.displayScale).toBe(1);
  });

  it("is zero growth once inflation and population are both removed", async () => {
    const out = await applyTransform(P_X, FULL, loader);
    expect(at(out.points, "2020-01-01")).toBeCloseTo(0, 6);
  });

  it("records one formula step per applied operation, in order", async () => {
    const out = await applyTransform(P_X, FULL, loader);

    expect(out.formulaChain).toHaveLength(4);
    expect(out.formulaChain[0]).toBe("PX (Billions of Dollars)");
    expect(out.formulaChain[1]).toBe("x PD(2019)/PD(t)");
    expect(out.formulaChain[2]).toBe("/ PP(t)");
    expect(out.formulaChain[3]).toBe("YoY % change");
  });

  it("builds the legend label from the same order", async () => {
    const out = await applyTransform(P_X, FULL, loader);
    expect(out.label).toBe("PX, real (2019$), per capita, YoY %");
  });

  it("reports a percent, not a level, once growth is applied", async () => {
    const out = await applyTransform(P_X, FULL, loader);
    expect(out.valueKind).toBe("PERCENT");
    expect(out.unitsShort).toBe("% YoY");
  });

  it("drops per capita for a ratio and warns once", async () => {
    const out = await applyTransform(
      P_X,
      { ...emptyTransform(), perCapita: true, populationSlug: "PP", percentOfSlug: "PD" },
      loader,
    );

    expect(out.effectiveSpec.perCapita).toBe(false);
    expect(out.warnings).toContain("Per capita has no effect on a ratio; it was ignored.");
  });

  it("does not resample a single series that is only taking a growth rate", async () => {
    const out = await applyTransform(P_X, { ...emptyTransform(), growth: "YOY" }, loader);
    expect(out.frequency).toBe("QUARTERLY");
    expect(out.points).toHaveLength(P_X.points.length);
  });
});

describe("order matters", () => {
  it("deflating after taking growth would give a different answer, so it does not", async () => {
    // Growth of the real level is 0 (proved above). Growth of the nominal level
    // is 10, and deflating a percent would be meaningless. Getting 0 is the
    // proof that real ran before growth.
    const realThenGrowth = await applyTransform(
      P_X,
      { ...FULL, perCapita: false },
      loader,
    );
    const growthOnly = await applyTransform(P_X, { ...emptyTransform(), growth: "YOY" }, loader);

    expect(at(realThenGrowth.points, "2020-01-01")).toBeCloseTo(0, 6);
    expect(at(growthOnly.points, "2020-01-01")).toBeCloseTo(10, 6);
  });
});
