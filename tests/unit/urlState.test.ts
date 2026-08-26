import { describe, expect, it } from "vitest";
import {
  MAX_SERIES,
  decodeState,
  encodeState,
  type DashboardState,
} from "@/lib/dashboard/urlState";

/**
 * Section 22.1, urlState.test.ts. The URL is the state, so a round trip that
 * loses information loses a saved dashboard, a shared link, and a lesson's
 * ability to check what the student is looking at.
 */

const RICH: DashboardState = {
  series: [
    {
      slug: "GDP",
      axis: "left",
      transform: {
        real: true,
        baseYear: 2017,
        deflatorSlug: "GDPDEF",
        perCapita: true,
        populationSlug: "POPTHM",
        percentOfSlug: null,
        growth: "YOY",
      },
    },
    {
      slug: "UNRATE",
      axis: "right",
      transform: {
        real: false,
        baseYear: null,
        deflatorSlug: null,
        perCapita: false,
        populationSlug: null,
        percentOfSlug: null,
        growth: "NONE",
      },
    },
    {
      slug: "PCEC",
      axis: "left",
      transform: {
        real: false,
        baseYear: null,
        deflatorSlug: null,
        perCapita: false,
        populationSlug: null,
        percentOfSlug: "GDP",
        growth: "POP_ANNUALIZED",
      },
    },
  ],
  start: "1970-01-01",
  end: "2024-10-01",
  showRecessions: false,
  logScale: true,
  title: "Living standards, three ways",
};

describe("round trip", () => {
  it("survives three series with mixed transforms, both axes, a range, and a title", () => {
    const back = decodeState(encodeState(RICH));
    expect(back).toEqual(RICH);
  });

  it("is idempotent", () => {
    const once = encodeState(decodeState(encodeState(RICH))).toString();
    const twice = encodeState(decodeState(new URLSearchParams(once))).toString();
    expect(twice).toBe(once);
  });

  it("writes the canonical example from Section 12.4", () => {
    const state = decodeState(
      new URLSearchParams("s=GDP~r2017.pc.g:yoy&s=UNRATE~ax:r&start=1970-01-01&rec=1"),
    );
    expect(decodeURIComponent(encodeState(state).toString())).toBe(
      "s=GDP~r2017.pc.g:yoy&s=UNRATE~ax:r&start=1970-01-01",
    );
  });
});

describe("decodeState never throws", () => {
  it("ignores an unknown token", () => {
    const state = decodeState(new URLSearchParams("s=GDP~zz.qq:1.g:yoy"));
    expect(state.series[0]?.slug).toBe("GDP");
    expect(state.series[0]?.transform.growth).toBe("YOY");
  });

  it("drops an r token without four digits", () => {
    const state = decodeState(new URLSearchParams("s=GDP~r20"));
    expect(state.series[0]?.transform.real).toBe(false);
    expect(state.series[0]?.transform.baseYear).toBeNull();
  });

  it("keeps only the first six series", () => {
    const params = new URLSearchParams();
    for (const slug of ["A", "B", "C", "D", "E", "F", "G", "H"]) params.append("s", slug);
    const state = decodeState(params);

    expect(state.series).toHaveLength(MAX_SERIES);
    expect(state.series.map((s) => s.slug)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("ignores a malformed date", () => {
    const state = decodeState(new URLSearchParams("s=GDP&start=yesterday&end=2020-13"));
    expect(state.start).toBeNull();
    expect(state.end).toBeNull();
  });

  it("parses tokens in any order", () => {
    const a = decodeState(new URLSearchParams("s=GDP~g:yoy.pc.r2017"));
    const b = decodeState(new URLSearchParams("s=GDP~r2017.pc.g:yoy"));
    expect(a).toEqual(b);
  });

  it("defaults recessions on and log scale off", () => {
    const state = decodeState(new URLSearchParams("s=GDP"));
    expect(state.showRecessions).toBe(true);
    expect(state.logScale).toBe(false);
  });

  it("rejects a slug carrying a separator", () => {
    expect(decodeState(new URLSearchParams("s=GD.P")).series).toHaveLength(0);
  });
});

describe("encodeState", () => {
  it("omits the defaults", () => {
    const state = decodeState(new URLSearchParams("s=GDP"));
    expect(encodeState(state).toString()).toBe("s=GDP");
  });

  it("writes rec=0 and log=1 only when they are not the default", () => {
    const state = decodeState(new URLSearchParams("s=GDP&rec=0&log=1"));
    const query = encodeState(state).toString();
    expect(query).toContain("rec=0");
    expect(query).toContain("log=1");
  });
});
