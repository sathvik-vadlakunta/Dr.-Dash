import type { LessonContent } from "../../../src/lib/lessons/schema";

/** Section 19.7, lesson 5. maxScore 90. */

export const LESSON_05 = {
  slug: "shares-of-gdp",
  title: "Shares of GDP",
  summary:
    "GDP splits into C + I + G + NX. Levels tell you size; shares tell you structure, and structure is what changes the argument.",
  level: "INTERMEDIATE",
  estimatedMinutes: 25,
  sortOrder: 50,
  content: {
    objectives: [
      "Express one series as a percent of another",
      "Read the expenditure shares of GDP and say which one does the cyclical work",
      "Explain why a series that crosses zero has no growth rate",
      "Argue why a debt-to-GDP ratio is the better measure of burden",
    ],
    sources: ["GDP", "PCEC", "GPDI", "GCE", "NETEXP", "GFDEBTN"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "GDP splits into consumption, investment, government purchases, and net exports. Plotted as levels they all rise together and tell you almost nothing. Plotted as shares of GDP they tell you how the economy is built and how that has changed.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot Consumption as a percent of Nominal GDP.",
        target: {
          series: [{ slug: "PCEC", transform: { percentOfSlug: "GDP" } }],
          exactSeriesSet: true,
        },
        hint: "Plot Consumption (C), then use Show as percent of and pick Nominal GDP.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_NUMERIC",
        prompt: "What share of GDP was consumption in 2019 Q4, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "ratioAt",
          args: { slug: "PCEC", denominatorSlug: "GDP", date: "2019-10-01" },
          tolerance: { type: "absolute", value: 1.0 },
        },
        points: 15,
        tries: 3,
        explanation:
          "About two thirds of output is household consumption. That single number explains why consumer spending gets the attention it does.",
        hint: "Hover 2019 Q4.",
      },
      {
        id: "s3",
        type: "TASK",
        body: "Add Investment and Government, both as a percent of Nominal GDP.",
        target: {
          series: [
            { slug: "PCEC", transform: { percentOfSlug: "GDP" } },
            { slug: "GPDI", transform: { percentOfSlug: "GDP" } },
            { slug: "GCE", transform: { percentOfSlug: "GDP" } },
          ],
          exactSeriesSet: true,
        },
        hint: "With Apply to set to All series, adding each one picks up the same transform.",
        allowAutoSet: true,
      },
      {
        id: "q2",
        type: "QUESTION_MC",
        prompt: "Which component's share has trended up most clearly since 1970?",
        options: [
          { id: "a", text: "Consumption" },
          { id: "b", text: "Investment" },
          { id: "c", text: "Government" },
          { id: "d", text: "All are flat." },
        ],
        answer: "a",
        points: 10,
        tries: 2,
        explanation:
          "The consumption share has drifted up by several points over half a century, largely against the government share. It is a slow structural change that no single year's data would show you.",
      },
      {
        id: "q3",
        type: "QUESTION_MC",
        prompt:
          "Investment's share is the most volatile of the three. What does that suggest about recessions?",
        options: [
          { id: "a", text: "Nothing." },
          {
            id: "b",
            text: "Investment does most of the cyclical work, falling sharply in downturns.",
          },
          { id: "c", text: "Government causes recessions." },
          { id: "d", text: "Consumption is unstable." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "Investment is a small share of GDP and a large share of its variance. Firms and households postpone a building or a machine easily; they postpone groceries with difficulty.",
      },
      {
        id: "s4",
        type: "TASK",
        body: "Remove the three components and plot Net Exports as a percent of Nominal GDP instead.",
        target: {
          series: [{ slug: "NETEXP", transform: { percentOfSlug: "GDP" } }],
          exactSeriesSet: true,
        },
        hint: "Remove each legend chip, then plot Net Exports (NX) and set Show as percent of to Nominal GDP.",
        allowAutoSet: true,
      },
      {
        id: "q4",
        type: "QUESTION_MC",
        prompt: "Why is a growth rate unavailable for net exports?",
        options: [
          { id: "a", text: "It is quarterly." },
          { id: "b", text: "The series crosses zero, so percent change has no stable meaning." },
          { id: "c", text: "It is nominal." },
          { id: "d", text: "It is too new." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "A percent change divides by the starting value. Near zero that division explodes, and once the sign flips the result changes sign for reasons that have nothing to do with the economy. Dr. Dash disables the control rather than printing a number nobody should use.",
      },
      {
        id: "s5",
        type: "TASK",
        body: "Now plot Federal Debt as a percent of Nominal GDP.",
        target: {
          series: [{ slug: "GFDEBTN", transform: { percentOfSlug: "GDP" } }],
          exactSeriesSet: true,
        },
        hint: "Open Government Finance, click Federal Debt, Total, then set Show as percent of to Nominal GDP.",
        allowAutoSet: true,
      },
      {
        id: "q5",
        type: "QUESTION_NUMERIC",
        prompt: "What is federal debt as a percent of GDP in 2019 Q4?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "ratioAt",
          args: { slug: "GFDEBTN", denominatorSlug: "GDP", date: "2019-10-01" },
          tolerance: { type: "absolute", value: 3.0 },
        },
        points: 15,
        tries: 3,
        explanation:
          "Debt was already above the size of a year's output before the pandemic. The level alone, in millions of dollars, would have told you nothing you could interpret.",
        hint: "Hover 2019 Q4.",
      },
      {
        id: "q6",
        type: "QUESTION_MC",
        prompt:
          "Both the debt level and the debt-to-GDP ratio rose over the last 40 years. Which is the better measure of the burden?",
        options: [
          { id: "a", text: "The level, because it is the amount owed." },
          {
            id: "b",
            text: "The ratio, because it compares the obligation to the income available to service it.",
          },
          { id: "c", text: "Neither." },
          { id: "d", text: "Both are identical." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "A mortgage is judged against income, not in isolation, and a government's debt is judged the same way. The ratio is a burden; the level is a number that grows with the economy whether or not anything has changed.",
      },
      {
        id: "q7",
        type: "QUESTION_SHORT",
        prompt: "Explain what a share of GDP tells you that a level does not.",
        rubric: {
          mustInclude: [
            ["relative", "share", "proportion", "compare"],
            ["size", "grow", "scale", "level"],
          ],
          minWords: 12,
        },
        points: 20,
        tries: 2,
        explanation:
          "A share divides out the growth of the economy as a whole, so what is left is structure: whether this piece is becoming a larger or smaller part of the whole, which the level cannot show because it rises with everything else.",
      },
      {
        id: "s6",
        type: "READ",
        body: "Notice that a ratio needs both series in comparable space. Dr. Dash refuses a rate as a denominator and deflates the denominator when the numerator has been deflated, because a ratio of incomparable things is not a share.",
      },
    ],
  } satisfies LessonContent,
};
