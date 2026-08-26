import { describe, expect, it } from "vitest";
import { EVAL_FUNCTIONS, answerSpecSchema, lessonContentSchema } from "@/lib/lessons/schema";
import { evaluate, parseNumericResponse } from "@/lib/lessons/evaluate";
import { TOLERANCE_FLOOR, effectiveTolerance, gradeAnswer, pointsFor } from "@/lib/lessons/grade";
import type { SeriesData } from "@/lib/series/types";
import { mk } from "../fixtures/series";

/**
 * Section 22.1, lessonEvaluate.test.ts.
 */

// A small deterministic world for the evaluators to read.
const CPI = mk("CPI", "MONTHLY", "INDEX", 1, [
  ["2019-01-01", 100],
  ["2019-06-01", 102],
  ["2020-01-01", 110],
  ["2020-06-01", 106],
]);

const GDP = mk("GDP", "QUARTERLY", "LEVEL_CURRENCY", 1e9, [
  ["2019-01-01", 1000],
  ["2019-04-01", 1010],
  ["2020-01-01", 1100],
]);

const DEFLATOR = mk("DEF", "QUARTERLY", "INDEX", 1, [
  ["2019-01-01", 100],
  ["2019-04-01", 100],
  ["2019-07-01", 100],
  ["2019-10-01", 100],
  ["2020-01-01", 110],
]);

const POP = mk("POP", "QUARTERLY", "LEVEL_COUNT", 1e3, [
  ["2019-01-01", 1000],
  ["2019-04-01", 1000],
  ["2020-01-01", 1000],
], { isNominal: false, flags: { isPopulation: true } });

const USREC = mk("USREC", "MONTHLY", "FLAG", 1, [
  ["2019-01-01", 0],
  ["2019-02-01", 1],
  ["2019-03-01", 1],
  ["2019-04-01", 0],
  ["2020-02-01", 1],
  ["2020-03-01", 0],
]);

const WORLD: Record<string, SeriesData> = {
  CPI,
  GDP,
  DEF: DEFLATOR,
  POP,
  USREC,
};

const ctx = {
  loader: async (slug: string): Promise<SeriesData> => {
    const found = WORLD[slug];
    if (!found) throw new Error(`no fixture for ${slug}`);
    return found;
  },
};

describe("the evaluator whitelist", () => {
  it("rejects a function that is not on it", () => {
    const parsed = answerSpecSchema.safeParse({
      kind: "computed",
      fn: "readTheAnswerKey",
      args: {},
      tolerance: { type: "absolute", value: 1 },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts every function that is", () => {
    for (const fn of EVAL_FUNCTIONS) {
      const parsed = answerSpecSchema.safeParse({
        kind: "computed",
        fn,
        args: {},
        tolerance: { type: "absolute", value: 1 },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("fails a lesson at seed time when a step names an unknown evaluator", () => {
    const bad = lessonContentSchema.safeParse({
      objectives: ["a", "b", "c"],
      sources: ["CPI"],
      steps: [
        { id: "s1", type: "TASK", body: "Plot it.", target: { series: [{ slug: "CPI" }] } },
        {
          id: "q1",
          type: "QUESTION_NUMERIC",
          prompt: "What?",
          unit: "percent",
          answer: { kind: "computed", fn: "rm -rf", args: {}, tolerance: { type: "absolute", value: 1 } },
          points: 10,
          explanation: "because",
        },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("fails a lesson whose question has no task before it to unlock it", () => {
    const bad = lessonContentSchema.safeParse({
      objectives: ["a", "b", "c"],
      sources: ["CPI"],
      steps: [
        {
          id: "q1",
          type: "QUESTION_MC",
          prompt: "What?",
          options: [
            { id: "a", text: "a" },
            { id: "b", text: "b" },
            { id: "c", text: "c" },
          ],
          answer: "a",
          points: 10,
          explanation: "because",
        },
      ],
    });
    expect(bad.success).toBe(false);
  });
});

describe("each evaluator", () => {
  it("valueAt reads the period", async () => {
    expect(await evaluate("valueAt", { slug: "CPI", date: "2019-06-01" }, ctx)).toBeCloseTo(102, 6);
  });

  it("yoyAt is a percent change for an index", async () => {
    expect(await evaluate("yoyAt", { slug: "CPI", date: "2020-01-01" }, ctx)).toBeCloseTo(10, 6);
  });

  it("annualizedPopAt compounds the period change", async () => {
    const value = await evaluate("annualizedPopAt", { slug: "GDP", date: "2019-04-01" }, ctx);
    // (1010/1000)^4 - 1 = 4.060401%
    expect(value as number).toBeCloseTo(4.060401, 6);
  });

  it("realValueAt returns display units", async () => {
    const value = await evaluate(
      "realValueAt",
      { slug: "GDP", date: "2020-01-01", baseYear: 2019, deflatorSlug: "DEF" },
      ctx,
    );
    // 1100 billions deflated by 100/110, read at the series' own scale.
    expect(value as number).toBeCloseTo(1000, 6);
  });

  it("perCapitaAt divides base units by persons", async () => {
    const value = await evaluate(
      "perCapitaAt",
      { slug: "GDP", date: "2019-01-01", transform: { populationSlug: "POP" } },
      ctx,
    );
    // 1000e9 over 1e6 persons.
    expect(value as number).toBeCloseTo(1_000_000, 6);
  });

  it("ratioAt is a percent", async () => {
    const value = await evaluate(
      "ratioAt",
      { slug: "GDP", denominatorSlug: "GDP", date: "2019-01-01" },
      ctx,
    );
    expect(value as number).toBeCloseTo(100, 6);
  });

  it("meanOver averages the window", async () => {
    const value = await evaluate("meanOver", { slug: "CPI", start: "2019-01-01", end: "2020-06-01" }, ctx);
    expect(value as number).toBeCloseTo((100 + 102 + 110 + 106) / 4, 6);
  });

  it("maxOver and minOver find the extremes", async () => {
    expect(await evaluate("maxOver", { slug: "CPI", start: "2019-01-01", end: "2020-06-01" }, ctx)).toBe(110);
    expect(await evaluate("minOver", { slug: "CPI", start: "2019-01-01", end: "2020-06-01" }, ctx)).toBe(100);
  });

  it("argmaxOver and argminOver return the date", async () => {
    expect(
      await evaluate("argmaxOver", { slug: "CPI", start: "2019-01-01", end: "2020-06-01" }, ctx),
    ).toBe("2020-01-01");
    expect(
      await evaluate("argminOver", { slug: "CPI", start: "2019-01-01", end: "2020-06-01" }, ctx),
    ).toBe("2019-01-01");
  });

  it("changeBetween subtracts in display units", async () => {
    const value = await evaluate(
      "changeBetween",
      { slug: "CPI", dateA: "2019-01-01", dateB: "2020-01-01" },
      ctx,
    );
    expect(value as number).toBeCloseTo(10, 6);
  });

  it("countRecessionsBetween counts runs starting in the window", async () => {
    expect(
      await evaluate("countRecessionsBetween", { start: "2019-01-01", end: "2020-12-01" }, ctx),
    ).toBe(2);
  });

  it("returns null when the period is not in the data", async () => {
    expect(await evaluate("valueAt", { slug: "CPI", date: "2035-01-01" }, ctx)).toBeNull();
  });
});

describe("tolerance", () => {
  it("floors a relative tolerance so answers near zero stay gradeable", () => {
    expect(effectiveTolerance({ type: "relative", value: 0.03 }, 0.1)).toBe(TOLERANCE_FLOOR);
    expect(effectiveTolerance({ type: "relative", value: 0.03 }, 1000)).toBeCloseTo(30, 6);
  });

  it("floors a percentage-point tolerance too", () => {
    expect(effectiveTolerance({ type: "percentagePoints", value: 0.01 }, 5)).toBe(TOLERANCE_FLOOR);
  });

  it("leaves an absolute tolerance alone", () => {
    expect(effectiveTolerance({ type: "absolute", value: 0.6 }, 100)).toBe(0.6);
  });
});

describe("grading", () => {
  const numericStep = {
    id: "q1",
    type: "QUESTION_NUMERIC" as const,
    prompt: "What was CPI in June 2019?",
    unit: "index",
    answer: {
      kind: "computed" as const,
      fn: "valueAt" as const,
      args: { slug: "CPI", date: "2019-06-01" },
      tolerance: { type: "absolute" as const, value: 0.5 },
    },
    points: 10,
    tries: 3,
    explanation: "It is 102.",
  };

  it("scales points by the try used", () => {
    expect(pointsFor(10, 1)).toBe(10);
    expect(pointsFor(10, 2)).toBe(6);
    expect(pointsFor(10, 3)).toBe(3);
    expect(pointsFor(10, 4)).toBe(0);
  });

  it("accepts an answer inside the tolerance", async () => {
    const result = await gradeAnswer({
      step: numericStep,
      response: "102.2",
      ctx,
      previousTries: 0,
    });
    expect(result.isCorrect).toBe(true);
  });

  it("does not consume a try for an unreadable answer", async () => {
    const result = await gradeAnswer({
      step: numericStep,
      response: "about a hundred",
      ctx,
      previousTries: 0,
    });
    expect(result.isCorrect).toBe(false);
    expect(result.consumedTry).toBe(false);
    expect(result.feedback).toBe("Enter a number.");
  });

  it("credits a question whose data is not published yet", async () => {
    let warned: string | null = null;
    const result = await gradeAnswer({
      step: {
        ...numericStep,
        answer: { ...numericStep.answer, args: { slug: "CPI", date: "2035-01-01" } },
      },
      response: "1",
      ctx,
      previousTries: 0,
      onEvaluatorNull: (fn) => {
        warned = fn;
      },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.feedback).toBe(
      "This period is not published yet, so this question was credited.",
    );
    expect(warned).toBe("valueAt");
  });

  it("withholds the explanation until the last try", async () => {
    const early = await gradeAnswer({ step: numericStep, response: "5", ctx, previousTries: 0 });
    expect(early.explanation).toBeNull();

    const last = await gradeAnswer({ step: numericStep, response: "5", ctx, previousTries: 2 });
    expect(last.explanation).toBe("It is 102.");
    expect(last.correctResponse).toBeCloseTo(102, 6);
  });

  it("grades a short answer on concepts and word count, naming only the count", async () => {
    const step = {
      id: "q2",
      type: "QUESTION_SHORT" as const,
      prompt: "Why?",
      rubric: { mustInclude: [["fast", "rate"], ["vary", "volatil"]], minWords: 5 },
      points: 20,
      tries: 2,
      explanation: "Because.",
    };

    const wrong = await gradeAnswer({
      step,
      response: "the rate of change is the point here",
      ctx,
      previousTries: 0,
    });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.feedback).toBe(
      "Your answer is missing 1 of the ideas we are looking for. Try again.",
    );

    const right = await gradeAnswer({
      step,
      response: "it shows how fast it moves and how much growth can vary year to year",
      ctx,
      previousTries: 0,
    });
    expect(right.isCorrect).toBe(true);

    const tooShort = await gradeAnswer({ step, response: "fast varies", ctx, previousTries: 0 });
    expect(tooShort.feedback).toBe("Write at least 5 words.");
  });

  it("compares an argmax answer at year granularity when the unit is a year", async () => {
    const result = await gradeAnswer({
      step: {
        id: "q3",
        type: "QUESTION_NUMERIC",
        prompt: "Which year?",
        unit: "year",
        answer: {
          kind: "computed",
          fn: "argmaxOver",
          args: { slug: "CPI", start: "2019-01-01", end: "2020-06-01" },
          tolerance: { type: "absolute", value: 0 },
        },
        points: 15,
        tries: 3,
        explanation: "2020.",
      },
      response: "2020",
      ctx,
      previousTries: 0,
    });
    expect(result.isCorrect).toBe(true);
  });
});

describe("parseNumericResponse", () => {
  it("strips the decoration a student pastes in", () => {
    expect(parseNumericResponse("4.3%")).toBe(4.3);
    expect(parseNumericResponse("$1,234.5")).toBe(1234.5);
    expect(parseNumericResponse("-7.4")).toBe(-7.4);
    expect(parseNumericResponse("+2")).toBe(2);
  });

  it("refuses anything that is not a number", () => {
    expect(parseNumericResponse("about three")).toBeNull();
    expect(parseNumericResponse("")).toBeNull();
  });
});
