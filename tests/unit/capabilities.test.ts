import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "@/lib/series/capabilities";
import { emptyTransform, type SeriesData } from "@/lib/series/types";
import { SEED_SERIES_BY_SLUG } from "../../prisma/seed/series";

/**
 * Section 22.1, capabilities.test.ts. The catalog rows are the input, so this
 * also guards the seed against drifting away from the Section 6.7 matrix.
 */

function seeded(slug: string): SeriesData {
  const s = SEED_SERIES_BY_SLUG.get(slug);
  if (!s) throw new Error(`${slug} is not seeded`);
  return {
    slug: s.slug,
    shortLabel: s.shortLabel,
    frequency: s.frequency,
    kind: s.kind,
    units: s.units,
    unitsShort: s.unitsShort,
    unitMultiplier: s.unitMultiplier,
    aggregation: s.aggregation,
    isNominal: s.isNominal,
    isRealAlready: s.isRealAlready,
    points: [],
    flags: {
      isPopulation: s.notes?.startsWith("POPULATION:") ?? false,
      canReal: s.canReal,
      canPerCapita: s.canPerCapita,
      canGrowth: s.canGrowth,
      canBeDenominator: s.canBeDenominator,
    },
  };
}

const spec = emptyTransform();

describe("capabilitiesFor", () => {
  it("disables real for a rate", () => {
    const caps = capabilitiesFor(seeded("UNRATE"), spec);
    expect(caps.real.enabled).toBe(false);
    expect(caps.perCapita.enabled).toBe(false);
    // A rate still has a meaningful change, in percentage points.
    expect(caps.growth.enabled).toBe(true);
  });

  it("disables real for a series that is already real, and says why", () => {
    const caps = capabilitiesFor(seeded("GDPC1"), spec);
    expect(caps.real.enabled).toBe(false);
    expect(caps.real.reason).toMatch(/Already/);
    expect(caps.perCapita.enabled).toBe(true);
  });

  it("disables everything for a flag", () => {
    const caps = capabilitiesFor(seeded("USREC"), spec);
    expect(caps.real.enabled).toBe(false);
    expect(caps.perCapita.enabled).toBe(false);
    expect(caps.growth.enabled).toBe(false);
    expect(caps.denominator.enabled).toBe(false);
  });

  it("disables per capita for a population series", () => {
    const caps = capabilitiesFor(seeded("POPTHM"), spec);
    expect(caps.perCapita.enabled).toBe(false);
    expect(caps.perCapita.reason).toMatch(/population/i);
  });

  it("disables the denominator for a rate", () => {
    const caps = capabilitiesFor(seeded("GFDEGDQ188S"), spec);
    expect(caps.denominator.enabled).toBe(false);
    expect(caps.denominator.reason).toBe("A rate cannot be a denominator");
  });

  it("enables real and per capita for a nominal monetary level", () => {
    const caps = capabilitiesFor(seeded("GDP"), spec);
    expect(caps.real.enabled).toBe(true);
    expect(caps.perCapita.enabled).toBe(true);
    expect(caps.growth.enabled).toBe(true);
    expect(caps.denominator.enabled).toBe(true);
  });

  it("disables growth for a series that crosses zero", () => {
    const caps = capabilitiesFor(seeded("NETEXP"), spec);
    expect(caps.growth.enabled).toBe(false);
  });

  it("disables per capita while a ratio is active, because population cancels", () => {
    const caps = capabilitiesFor(seeded("GDP"), { ...spec, percentOfSlug: "PCEC" });
    expect(caps.perCapita.enabled).toBe(false);
    expect(caps.perCapita.reason).toBe("Population cancels in a ratio");
  });

  it("disables real for an index", () => {
    const caps = capabilitiesFor(seeded("CPIAUCSL"), spec);
    expect(caps.real.enabled).toBe(false);
    expect(caps.real.reason).toBe("Index numbers are already scale free");
    expect(caps.denominator.enabled).toBe(true);
  });
});
