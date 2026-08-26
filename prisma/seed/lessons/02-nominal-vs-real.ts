import type { LessonContent } from "../../../src/lib/lessons/schema";

/** Section 19.7, lesson 2. maxScore 85. */

export const LESSON_02 = {
  slug: "nominal-vs-real",
  title: "Why a dollar is not a dollar",
  summary:
    "A monetary total from 1975 cannot be compared to one from 2025, because the dollar itself changed. Adjusting for inflation is what makes the comparison legitimate.",
  level: "INTRO",
  estimatedMinutes: 20,
  sortOrder: 20,
  content: {
    objectives: [
      "Separate a change in prices from a change in quantities",
      "Deflate a nominal series to a base year of your choosing",
      "Predict what changing the base year does to the level and to the growth rate",
      "Read a real series' units and say what they mean",
    ],
    sources: ["GDP", "GDPC1", "GDPDEF", "CPIAUCSL"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "A monetary total from 1975 cannot be compared to one from 2025, because the dollar itself changed. Part of every increase in a dollar figure is more stuff, and part is higher prices. Separating the two is the single most common thing a macroeconomist does to a series.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot Nominal GDP as a level, starting in 1970.",
        target: {
          series: [{ slug: "GDP", transform: { real: false, growth: "NONE" } }],
          exactSeriesSet: true,
          start: "1970-01-01",
        },
        hint: "Open National Income and Output, click Nominal GDP, then set the start date to 1970-01-01.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_MC",
        prompt:
          "Nominal GDP is many times larger than it was in 1970. Does that mean the economy produces that many times more goods and services?",
        options: [
          { id: "a", text: "Yes." },
          { id: "b", text: "No, because part of the increase is higher prices." },
          { id: "c", text: "No, because population fell." },
          { id: "d", text: "Cannot tell from any data." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "A nominal total is quantities valued at each period's own prices. When prices rise, the total rises even if nothing more is produced. The whole point of deflating is to hold prices fixed so the movement is quantities only.",
      },
      {
        id: "s3",
        type: "TASK",
        body: "Turn on Adjust for inflation, with base year 2017 and the GDP deflator.",
        target: {
          series: [
            { slug: "GDP", transform: { real: true, baseYear: 2017, deflatorSlug: "GDPDEF" } },
          ],
          exactSeriesSet: true,
        },
        hint: "In the transform panel, switch on Adjust for inflation, then choose 2017 and GDP Deflator.",
        allowAutoSet: true,
      },
      {
        id: "q2",
        type: "QUESTION_NUMERIC",
        prompt: "What is real GDP in 2000 Q1, in billions of 2017 dollars?",
        unit: "2017 dollars",
        answer: {
          kind: "computed",
          fn: "realValueAt",
          args: { slug: "GDP", date: "2000-01-01", baseYear: 2017, deflatorSlug: "GDPDEF" },
          tolerance: { type: "relative", value: 0.03 },
        },
        points: 15,
        tries: 3,
        explanation:
          "Deflating multiplies every period by the ratio of the base year's price level to that period's. Prices in 2000 were well below 2017's, so the 2000 figure is scaled up: the same quantities cost more at 2017 prices.",
        hint: "Hover the line at 2000 Q1 and read the tooltip.",
      },
      {
        id: "q3",
        type: "QUESTION_MC",
        prompt: "Change the base year from 2017 to 1990. What happens?",
        options: [
          { id: "a", text: "The whole line shifts to smaller numbers, but its shape is unchanged." },
          { id: "b", text: "The shape changes." },
          { id: "c", text: "Nothing changes." },
          { id: "d", text: "The line becomes nominal again." },
        ],
        answer: "a",
        points: 10,
        tries: 2,
        explanation:
          "Changing the base year multiplies every period by the same constant, the ratio of the two base-year price levels. A constant multiple moves the level and leaves every ratio between periods, and therefore the shape, exactly as it was.",
      },
      {
        id: "s4",
        type: "TASK",
        body: "Set the base year to 1990 and switch to a year-over-year growth rate.",
        target: {
          series: [{ slug: "GDP", transform: { real: true, baseYear: 1990, growth: "YOY" } }],
          exactSeriesSet: true,
        },
        hint: "Change the base-year select to 1990, then choose Growth, year over year.",
        allowAutoSet: true,
      },
      {
        id: "q4",
        type: "QUESTION_NUMERIC",
        prompt: "With base year 1990, what is real GDP growth in 2000 Q1, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "yoyAt",
          args: {
            slug: "GDP",
            date: "2000-01-01",
            transform: { real: true, baseYear: 1990, deflatorSlug: "GDPDEF" },
          },
          tolerance: { type: "absolute", value: 0.3 },
        },
        points: 15,
        tries: 3,
        explanation:
          "This is real growth: the price effect has been removed, so what is left is the change in quantities produced.",
        hint: "Hover 2000 Q1 on the growth line.",
      },
      {
        id: "q5",
        type: "QUESTION_NUMERIC",
        prompt:
          "Now set base year 2017 and read the same quarter's growth rate. By how many percentage points did it change?",
        unit: "percentage points",
        answer: { kind: "literal", value: 0 },
        points: 15,
        tries: 3,
        explanation:
          "It did not change at all. A growth rate is a ratio between two periods, and the base year multiplies both by the same constant, which cancels. The base year is a choice of measuring stick, not a claim about the data.",
        hint: "Change the base year and hover the same quarter. Compare the two readings.",
      },
      {
        id: "q6",
        type: "QUESTION_SHORT",
        prompt:
          "Explain why the base year changes the level of a real series but not its growth rate.",
        rubric: {
          mustInclude: [
            ["scal", "multipl", "constant", "factor"],
            ["growth", "percent change", "ratio"],
          ],
          minWords: 15,
        },
        points: 20,
        tries: 2,
        explanation:
          "Deflating to a different base year multiplies every observation by one constant. The level therefore moves, and any ratio between two observations, which is what a growth rate is, leaves that constant untouched.",
      },
      {
        id: "s5",
        type: "READ",
        body: "The base year is a unit of account, not a fact about the economy. Report it, because a reader needs to know which dollars you mean, and never argue from it.",
      },
    ],
  } satisfies LessonContent,
};
