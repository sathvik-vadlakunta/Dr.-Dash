import type { LessonContent } from "../../../src/lib/lessons/schema";

/** Section 19.7, lesson 3. maxScore 80. */

export const LESSON_03 = {
  slug: "per-capita-living-standards",
  title: "Output per person",
  summary:
    "An economy can grow simply by adding people. Living standards depend on output per person, which is a different series and often a different story.",
  level: "INTRO",
  estimatedMinutes: 20,
  sortOrder: 30,
  content: {
    objectives: [
      "Turn an aggregate into a per-person figure",
      "Compare the shape of an aggregate to the shape of its per capita version",
      "Recover population growth from the gap between the two growth rates",
      "Say why per capita real GDP is the standard measure of living standards",
    ],
    sources: ["GDPC1", "POPTHM", "B230RC0Q173SBEA"],
    steps: [
      {
        id: "s1",
        type: "READ",
        body: "An economy can grow simply by adding people. Twice as many workers producing at the same rate is twice the output and no improvement at all in anyone's material circumstances. Living standards depend on output per person.",
      },
      {
        id: "s2",
        type: "TASK",
        body: "Plot Real GDP as a level over its full history.",
        target: {
          series: [
            {
              slug: "GDPC1",
              transform: { growth: "NONE", real: false, perCapita: false, percentOfSlug: null },
            },
          ],
          exactSeriesSet: true,
        },
        hint: "Open National Income and Output, then click Real GDP.",
        allowAutoSet: true,
      },
      {
        id: "s3",
        type: "TASK",
        body: "Turn on Per capita.",
        target: {
          series: [{ slug: "GDPC1", transform: { perCapita: true, growth: "NONE" } }],
          exactSeriesSet: true,
        },
        hint: "In the transform panel, switch on Per capita. Dr. Dash picks the quarterly population series for you.",
        allowAutoSet: true,
      },
      {
        id: "q1",
        type: "QUESTION_NUMERIC",
        prompt: "What is real GDP per capita in 2019 Q4, in 2017 dollars per person?",
        unit: "2017 dollars",
        answer: {
          kind: "computed",
          fn: "perCapitaAt",
          args: { slug: "GDPC1", date: "2019-10-01" },
          tolerance: { type: "relative", value: 0.03 },
        },
        points: 15,
        tries: 3,
        explanation:
          "Roughly sixty thousand dollars of output per person per year. It is worth carrying that order of magnitude around, because it makes any claim about the size of a government program or an industry immediately checkable.",
        hint: "Hover 2019 Q4. Note that the axis label changed to dollars per person.",
      },
      {
        id: "q2",
        type: "QUESTION_MC",
        prompt: "Compare the per capita line's shape to the aggregate line's shape.",
        options: [
          { id: "a", text: "Identical." },
          { id: "b", text: "Same direction, but flatter, because population also grew." },
          { id: "c", text: "Opposite direction." },
          { id: "d", text: "Per capita is more volatile." },
        ],
        answer: "b",
        points: 10,
        tries: 2,
        explanation:
          "Dividing by a series that itself trends up removes part of the trend. What is left is the part of output growth that actually raised output per person.",
      },
      {
        id: "s4",
        type: "TASK",
        body: "Keep Per capita on and switch to a year-over-year growth rate. Note the reading for 2015, then turn Per capita off and read it again.",
        target: {
          series: [{ slug: "GDPC1", transform: { perCapita: true, growth: "YOY" } }],
          exactSeriesSet: true,
        },
        hint: "Choose Growth, year over year while Per capita is still on.",
        allowAutoSet: true,
      },
      {
        id: "q3",
        type: "QUESTION_NUMERIC",
        prompt:
          "In 2015, aggregate real GDP growth minus real GDP per capita growth is approximately what, in percentage points? (This difference is population growth.)",
        unit: "percentage points",
        answer: { kind: "range", min: 0.4, max: 1.0 },
        points: 15,
        tries: 3,
        explanation:
          "The gap between the two growth rates is population growth, because dividing by population subtracts its growth rate from the aggregate's. U.S. population was growing around three quarters of a percent a year in 2015.",
        hint: "Read the growth rate with Per capita on, then with it off, and subtract.",
      },
      {
        id: "q4",
        type: "QUESTION_MC",
        prompt:
          "Two countries both grow real GDP at 3%. Country A's population grows 0.5%, Country B's grows 2.5%. Which raises living standards faster?",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "Same" },
          { id: "d", text: "Cannot tell." },
        ],
        answer: "a",
        points: 10,
        tries: 2,
        explanation:
          "Per capita growth is roughly aggregate growth minus population growth: 2.5% for A against 0.5% for B. The headline growth rates are identical and the outcomes for a typical person are not close.",
      },
      {
        id: "q5",
        type: "QUESTION_SHORT",
        prompt: "Explain why a country can have rising GDP and falling living standards.",
        rubric: {
          mustInclude: [
            ["population", "people", "per person", "per capita"],
            ["fall", "decline", "slower", "less"],
          ],
          minWords: 12,
        },
        points: 20,
        tries: 2,
        explanation:
          "If population grows faster than output, the aggregate rises while output per person falls. The headline number goes up and the typical person is worse off.",
      },
      {
        id: "s5",
        type: "READ",
        body: "Real per capita GDP is the standard summary of material living standards, and its growth rate is the standard summary of how fast they improve. Notice that getting there took two transforms of one series, and no new data at all.",
      },
    ],
  } satisfies LessonContent,
};
