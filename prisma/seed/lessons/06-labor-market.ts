import type { LessonContent } from "../../../src/lib/lessons/schema";

/** Section 19.7, lesson 6. maxScore 90. */

export const LESSON_06 = {
  slug: "reading-the-labor-market",
  title: "Reading the labor market",
  summary:
    "No single labor series is sufficient. Three views of the same market disagree in informative ways, and knowing why is most of the skill.",
  level: "INTERMEDIATE",
  estimatedMinutes: 25,
  sortOrder: 60,
  content: {
    objectives: [
      "Find and date the peak unemployment rate of the last quarter century",
      "Relate payroll growth to the unemployment rate around recessions",
      "Explain what a falling participation rate does to the unemployment rate",
      "Say why the employment-population ratio can disagree with the unemployment rate",
    ],
    sources: ["UNRATE", "PAYEMS", "CIVPART", "EMRATIO", "USREC"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "No single labor series is sufficient. The unemployment rate counts only people who say they are looking for work. Payrolls count jobs, not people. The employment-population ratio counts everyone. When they disagree, the disagreement is the finding.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot the unemployment rate over its full history, with recession shading on.",
        target: {
          series: [
            {
              slug: "UNRATE",
              transform: { growth: "NONE", real: false, perCapita: false, percentOfSlug: null },
            },
          ],
          exactSeriesSet: true,
          showRecessions: true,
        },
        hint: "Open Labor Market, then click Unemployment Rate.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_NUMERIC",
        prompt:
          "What was the highest unemployment rate recorded between 2000 and today, in percent?",
        unit: "percent",
        answer: {
          kind: "computed",
          fn: "maxOver",
          args: { slug: "UNRATE", start: "2000-01-01", end: "2026-12-01" },
          tolerance: { type: "absolute", value: 0.3 },
        },
        points: 15,
        tries: 3,
        explanation:
          "April 2020 produced the highest monthly reading in the history of the series, and it lasted months rather than years. Depth and duration are separate facts about a recession.",
        hint: "Set the start date to 2000-01-01 and find the tallest point.",
      },
      {
        id: "q2",
        type: "QUESTION_NUMERIC",
        prompt: "In which year did that peak occur?",
        unit: "year",
        answer: {
          kind: "computed",
          fn: "argmaxOver",
          args: { slug: "UNRATE", start: "2000-01-01", end: "2026-12-01" },
          tolerance: { type: "absolute", value: 0 },
        },
        points: 15,
        tries: 3,
        explanation:
          "Compare it to the 2009 peak, which was lower but took years to unwind. A chart makes that contrast in one glance; a table of annual averages hides it.",
        hint: "Hover the tallest point and read its date.",
      },
      {
        id: "s3",
        type: "TASK",
        body: "Add Nonfarm Payrolls with a year-over-year growth rate, on the right axis.",
        target: {
          series: [
            { slug: "UNRATE", axis: "left" },
            { slug: "PAYEMS", transform: { growth: "YOY" }, axis: "right" },
          ],
          exactSeriesSet: true,
        },
        hint: "Click Nonfarm Payrolls, set Apply to: Selected, choose Growth year over year, then move it to the right axis.",
        allowAutoSet: true,
      },
      {
        id: "q3",
        type: "QUESTION_MC",
        prompt: "Compare the two lines around recessions.",
        options: [
          {
            id: "a",
            text: "Payroll growth turns negative around the same time unemployment rises.",
          },
          { id: "b", text: "They move together in the same direction." },
          { id: "c", text: "Payroll growth leads by five years." },
          { id: "d", text: "No relationship." },
        ],
        answer: "a",
        points: 10,
        tries: 2,
        explanation:
          "They are two measurements of one event, taken from different surveys. That they agree on timing is what gives either of them credibility.",
      },
      {
        id: "s4",
        type: "TASK",
        body: "Remove payrolls and add the labor force participation rate on the right axis instead.",
        target: {
          series: [
            { slug: "UNRATE", axis: "left" },
            { slug: "CIVPART", axis: "right" },
          ],
          exactSeriesSet: true,
        },
        hint: "Remove the payrolls chip, then click Labor Force Participation and move it to the right axis.",
        allowAutoSet: true,
      },
      {
        id: "q4",
        type: "QUESTION_MC",
        prompt:
          "The unemployment rate fell during parts of 2010 to 2015 while participation also fell. What does that combination suggest?",
        options: [
          { id: "a", text: "The labor market was unambiguously strong." },
          {
            id: "b",
            text: "Some of the decline in unemployment came from people leaving the labor force, not from finding work.",
          },
          { id: "c", text: "Population fell." },
          { id: "d", text: "The data is wrong." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "Someone who stops looking leaves the numerator and the denominator of the unemployment rate at once, which pushes the rate down. Nothing good happened to them, and the headline number improved.",
      },
      {
        id: "s5",
        type: "TASK",
        body: "Add the employment-population ratio alongside participation on the right axis.",
        target: {
          series: [
            { slug: "UNRATE", axis: "left" },
            { slug: "CIVPART", axis: "right" },
            { slug: "EMRATIO", axis: "right" },
          ],
          exactSeriesSet: true,
        },
        hint: "Click Employment-Population Ratio, then move it to the right axis.",
        allowAutoSet: true,
      },
      {
        id: "q5",
        type: "QUESTION_NUMERIC",
        prompt:
          "By how many percentage points did the employment-population ratio change between December 2007 and December 2010?",
        unit: "percentage points",
        answer: {
          kind: "computed",
          fn: "changeBetween",
          args: { slug: "EMRATIO", dateA: "2007-12-01", dateB: "2010-12-01" },
          tolerance: { type: "absolute", value: 0.4 },
        },
        points: 15,
        tries: 3,
        explanation:
          "A fall of roughly four points is enormous for this series, and it never fully returned. The unemployment rate, meanwhile, was back near its pre-crisis level within a few more years.",
        hint: "Hover December 2007 and December 2010 and subtract.",
      },
      {
        id: "q6",
        type: "QUESTION_MC",
        prompt:
          "Why does the employment-population ratio sometimes tell a different story than the unemployment rate?",
        options: [
          { id: "a", text: "Different seasonal adjustment." },
          {
            id: "b",
            text: "Its denominator is the whole population, so it does not depend on whether non-workers say they are looking.",
          },
          { id: "c", text: "It is quarterly." },
          { id: "d", text: "It excludes government workers." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "Change the denominator and you change the question. The unemployment rate asks about people who want work; the employment-population ratio asks about everyone, which is why it is slower to look good.",
      },
      {
        id: "q7",
        type: "QUESTION_SHORT",
        prompt:
          "Name two different reasons the unemployment rate can fall, and say how you would tell them apart in the data.",
        rubric: {
          mustInclude: [
            ["hire", "job", "employ", "find work"],
            ["leave", "drop out", "participation", "labor force"],
          ],
          minWords: 20,
        },
        points: 20,
        tries: 2,
        explanation:
          "It falls when people find work and it falls when people stop looking. Participation and the employment-population ratio separate the two: if they rise with the falling unemployment rate, people found jobs; if they fall, people left.",
      },
      {
        id: "s6",
        type: "READ",
        body: "Three series, one labor market, three different questions. Plotting them together took four clicks, and it is the difference between quoting a headline and reading the data.",
      },
    ],
  } satisfies LessonContent,
};
