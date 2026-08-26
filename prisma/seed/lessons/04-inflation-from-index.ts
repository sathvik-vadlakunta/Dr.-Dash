import type { LessonContent } from "../../../src/lib/lessons/schema";

/** Section 19.7, lesson 4. maxScore 85. */

export const LESSON_04 = {
  slug: "inflation-from-an-index",
  title: "Inflation is a growth rate",
  summary:
    "A price index is a level. Inflation is its growth rate. Students confuse the two constantly, and the confusion is visible the moment you plot both.",
  level: "INTRO",
  estimatedMinutes: 20,
  sortOrder: 40,
  content: {
    objectives: [
      "Read what an index's base period means",
      "Turn a price index into an inflation rate",
      "Find the postwar inflation peak and date it",
      "Explain why a rate changes in percentage points, not percent",
    ],
    sources: ["CPIAUCSL", "UNRATE", "DD_INFL_CPI"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "A price index is a level. Inflation is its growth rate. The index answers how high prices are relative to some base period; inflation answers how fast they are rising right now. The two can move in opposite directions, and routinely do.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot the CPI as a level over its full history.",
        target: {
          series: [
            {
              slug: "CPIAUCSL",
              transform: { growth: "NONE", real: false, perCapita: false, percentOfSlug: null },
            },
          ],
          exactSeriesSet: true,
        },
        hint: "Open Prices and Inflation, then click CPI, All Items.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_MC",
        prompt: "The units say Index 1982-1984=100. What does that mean?",
        options: [
          { id: "a", text: "Prices were 100 dollars then." },
          {
            id: "b",
            text: "The index is scaled so its average over 1982 to 1984 equals 100, so only ratios between periods are meaningful.",
          },
          { id: "c", text: "Inflation was 100% then." },
          { id: "d", text: "It is a percentage." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "An index number has no units of its own. Its level carries no information; the ratio of two of its values does, and that ratio is what every inflation calculation uses.",
      },
      {
        id: "s3",
        type: "TASK",
        body: "Switch the CPI to a year-over-year growth rate. That is inflation.",
        target: {
          series: [{ slug: "CPIAUCSL", transform: { growth: "YOY" } }],
          exactSeriesSet: true,
        },
        hint: "In the transform panel, choose Growth, year over year.",
        allowAutoSet: true,
      },
      {
        id: "q2",
        type: "QUESTION_NUMERIC",
        prompt: "What was CPI inflation in June 2022, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "yoyAt",
          args: { slug: "CPIAUCSL", date: "2022-06-01" },
          tolerance: { type: "absolute", value: 0.4 },
        },
        points: 15,
        tries: 3,
        explanation:
          "The 2022 peak was the highest reading in four decades. Notice how invisible it is in the index chart, where it is a slightly steeper stretch of an already-rising line.",
        hint: "Hover June 2022 on the growth line.",
      },
      {
        id: "q3",
        type: "QUESTION_NUMERIC",
        prompt: "In what year did CPI inflation reach its highest year-over-year value since 1950?",
        unit: "year",
        answer: {
          kind: "computed",
          fn: "argmaxOver",
          args: {
            slug: "CPIAUCSL",
            start: "1950-01-01",
            end: "2019-12-01",
            transform: { growth: "YOY" },
          },
          tolerance: { type: "absolute", value: 0 },
        },
        points: 15,
        tries: 3,
        explanation:
          "The Great Inflation peaked at the turn of the 1980s, which is the episode every later inflation is measured against.",
        hint: "Set the range to 1950 through 2019 and find the tallest point.",
      },
      {
        id: "s4",
        type: "TASK",
        body: "Add the unemployment rate, on the right axis.",
        target: {
          series: [
            { slug: "CPIAUCSL", transform: { growth: "YOY" }, axis: "left" },
            { slug: "UNRATE", axis: "right" },
          ],
          exactSeriesSet: true,
        },
        hint: "Open Labor Market, click Unemployment Rate, then use the legend chip's R button.",
        allowAutoSet: true,
      },
      {
        id: "q4",
        type: "QUESTION_MC",
        prompt: "Why does the unemployment rate need its own axis here?",
        options: [
          { id: "a", text: "It is a different color." },
          {
            id: "b",
            text: "It is measured in percent of the labor force, not percent change in prices, so sharing an axis would imply a comparison that does not exist.",
          },
          { id: "c", text: "It is monthly." },
          { id: "d", text: "It is seasonally adjusted." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "Two series can both be printed with a percent sign and still measure unrelated things. Putting them on one axis invites a reader to compare heights that mean nothing to each other.",
      },
      {
        id: "q5",
        type: "QUESTION_NUMERIC",
        prompt:
          "Apply year-over-year growth to the unemployment rate. What is the reading for April 2020?",
        unit: "percentage points",
        answer: {
          kind: "computed",
          fn: "yoyAt",
          args: { slug: "UNRATE", date: "2020-04-01" },
          tolerance: { type: "absolute", value: 0.5 },
        },
        points: 15,
        tries: 3,
        explanation:
          "The unemployment rate is already a percent, so its change is reported in percentage points: it went from around 3.6 to around 14.7, a jump of about 11 points. Reporting that as a percent change would give roughly 300%, which is arithmetically true and useless.",
        hint: "Apply the growth transform to the unemployment rate and read April 2020.",
      },
      {
        id: "q6",
        type: "QUESTION_SHORT",
        prompt:
          "Explain why the change in the unemployment rate is reported in percentage points rather than percent.",
        rubric: {
          mustInclude: [
            ["already", "itself", "is a rate", "is a percent"],
            ["percentage point", "pp", "difference", "subtract"],
          ],
          minWords: 12,
        },
        points: 20,
        tries: 2,
        explanation:
          "The series is already a percent, so a percent change would be a percent of a percent, which depends on where the rate started. Subtracting gives a difference in percentage points, which means the same thing at any level.",
      },
      {
        id: "s6",
        type: "READ",
        body: "Dr. Dash publishes this growth rate as a series of its own, CPI Inflation Rate, because no government database reports headline inflation as a series. It reports the index and leaves the growth rate to you.",
      },
    ],
  } satisfies LessonContent,
};
