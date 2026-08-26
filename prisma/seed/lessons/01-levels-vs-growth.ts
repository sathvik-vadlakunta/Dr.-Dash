import type { LessonContent } from "../../../src/lib/lessons/schema";

/**
 * Section 19.6, written out in the spec and reproduced here exactly. It is the
 * template every other lesson follows: read, do the task in the real product,
 * then answer a question about what you just saw.
 */

export const LESSON_01 = {
  slug: "levels-vs-growth",
  title: "Levels versus growth rates",
  summary:
    "The same data tells you different things depending on how you look at it. Start with the most important series in macroeconomics.",
  level: "INTRO",
  estimatedMinutes: 20,
  sortOrder: 10,
  content: {
    objectives: [
      "Read a level chart and a growth rate chart of the same series",
      "State what a growth rate reveals that a level hides",
      "Find the U.S. economy's average growth rate and its typical volatility",
      "Connect negative growth to recession dating",
    ],
    sources: ["GDPC1", "USREC"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "Real GDP measures the total quantity of goods and services the economy produces, valued at constant prices. It is the single most watched macroeconomic series. You are going to look at it two ways.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot Real GDP over its full history, with recession shading on.",
        target: {
          series: [
            {
              slug: "GDPC1",
              transform: { growth: "NONE", real: false, perCapita: false, percentOfSlug: null },
            },
          ],
          exactSeriesSet: true,
          showRecessions: true,
        },
        hint: "Open National Income and Output in the catalog, then click Real GDP.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_MC",
        prompt: "Looking at the level of real GDP, which statement is easiest to support?",
        options: [
          { id: "a", text: "Output has grown over time, with occasional interruptions." },
          { id: "b", text: "Output grows at a steady 3% every year." },
          { id: "c", text: "Output was more volatile after 1990 than before." },
          { id: "d", text: "Prices rose faster than output." },
        ],
        answer: "a",
        points: 10,
        tries: 2,
        explanation:
          "A level chart makes the long-run direction obvious. It is poor at showing how much growth varies, because a 2% change late in the sample is a much larger vertical move than a 2% change early in the sample.",
      },
      {
        id: "s3",
        type: "TASK",
        body: "Now switch the same series to a year-over-year growth rate.",
        target: {
          series: [{ slug: "GDPC1", transform: { growth: "YOY" } }],
          exactSeriesSet: true,
        },
        hint: "In the transform panel, choose Growth, year over year.",
        allowAutoSet: true,
      },
      {
        id: "q2",
        type: "QUESTION_MC",
        prompt: "What is now visible that was not visible in the level chart?",
        options: [
          { id: "a", text: "The size of the economy." },
          {
            id: "b",
            text: "How much growth varies from year to year, and when it turns negative.",
          },
          { id: "c", text: "The price level." },
          { id: "d", text: "The unemployment rate." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "The growth rate rescales every period by its own starting value, so a 2% change looks the same in 1955 and in 2025. Volatility and sign changes become readable.",
      },
      {
        id: "q3",
        type: "QUESTION_NUMERIC",
        prompt:
          "Hover the second quarter of 2020. What was the year-over-year growth rate of real GDP, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "yoyAt",
          args: { slug: "GDPC1", date: "2020-04-01" },
          tolerance: { type: "absolute", value: 0.6 },
        },
        points: 15,
        tries: 3,
        explanation:
          "The 2020 Q2 collapse is the largest one-quarter contraction in the postwar record. Reading it off the growth chart takes one hover; reading it off the level chart takes arithmetic.",
        hint: "Turn on the tooltip by hovering the line at 2020 Q2.",
      },
      {
        id: "q4",
        type: "QUESTION_MC",
        prompt: "Compare the shaded recession bands to the growth line. Which is true?",
        options: [
          { id: "a", text: "Growth is always negative for the entire shaded band." },
          {
            id: "b",
            text: "Growth is usually negative during or near the shaded bands, but not in every quarter of every band.",
          },
          { id: "c", text: "Shaded bands occur when growth exceeds 3%." },
          { id: "d", text: "There is no relationship." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "NBER recession dating uses several indicators, not a mechanical two-quarter rule on real GDP, so the correspondence is close but not exact.",
      },
      {
        id: "q5",
        type: "QUESTION_NUMERIC",
        prompt:
          "Set the start date to 1948-01-01 and the end date to 2019-10-01. What is the average year-over-year growth rate of real GDP over that window, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "meanOver",
          args: {
            slug: "GDPC1",
            start: "1948-01-01",
            end: "2019-10-01",
            transform: { growth: "YOY" },
          },
          tolerance: { type: "absolute", value: 0.4 },
        },
        points: 15,
        tries: 3,
        explanation:
          "Roughly 3% per year is the number to carry around. It is the benchmark against which any single year is judged.",
        hint: "Use the date inputs in the toolbar, then read the average off the growth line.",
      },
      {
        id: "q6",
        type: "QUESTION_SHORT",
        prompt:
          "In two or three sentences, explain what the growth rate showed you that the level did not, and why.",
        rubric: {
          mustInclude: [
            ["fast", "rate", "speed", "quick", "pace"],
            ["vary", "volatil", "fluctuat", "negative", "recession"],
          ],
          minWords: 15,
        },
        points: 20,
        tries: 2,
        explanation:
          "The level answers how big. The growth rate answers how fast, and by rescaling each period by its own base it makes variation and sign changes comparable across the whole sample.",
      },
      {
        id: "s4",
        type: "READ",
        body: "One series, two views, two different sets of facts. Every transformation in Dr. Dash works this way: it does not add data, it changes what the data can tell you.",
      },
    ],
  } satisfies LessonContent,
};
