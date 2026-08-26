import { z } from "zod";

/**
 * Section 19.2. The lesson content schema, enforced at seed time and again at
 * grade time. A lesson that names an evaluator outside the whitelist fails to
 * seed, so a broken answer key is caught by `pnpm db:seed` rather than by a
 * student halfway through an assignment.
 */

const stepId = z.string().min(1).max(32);

const transformPartialSchema = z
  .object({
    real: z.boolean(),
    baseYear: z.number().int().nullable(),
    deflatorSlug: z.string().nullable(),
    perCapita: z.boolean(),
    populationSlug: z.string().nullable(),
    percentOfSlug: z.string().nullable(),
    growth: z.enum(["NONE", "YOY", "POP", "POP_ANNUALIZED"]),
  })
  .partial();

export const dashboardTargetSchema = z.object({
  series: z.array(
    z.object({
      slug: z.string().min(1),
      // Only the keys that are listed get checked.
      transform: transformPartialSchema.optional(),
      axis: z.enum(["left", "right"]).optional(),
    }),
  ),
  exactSeriesSet: z.boolean().default(true),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  showRecessions: z.boolean().optional(),
});

export type DashboardTarget = z.infer<typeof dashboardTargetSchema>;

/** Section 19.4. Only these functions may appear in an `AnswerSpec`. */
export const EVAL_FUNCTIONS = [
  "valueAt",
  "yoyAt",
  "annualizedPopAt",
  "realValueAt",
  "perCapitaAt",
  "ratioAt",
  "meanOver",
  "maxOver",
  "minOver",
  "argmaxOver",
  "argminOver",
  "changeBetween",
  "countRecessionsBetween",
] as const;

export type EvalFn = (typeof EVAL_FUNCTIONS)[number];

export const toleranceSchema = z.object({
  type: z.enum(["relative", "absolute", "percentagePoints"]),
  value: z.number().nonnegative(),
});

export type Tolerance = z.infer<typeof toleranceSchema>;

export const answerSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.number() }),
  z.object({ kind: z.literal("range"), min: z.number(), max: z.number() }),
  z.object({
    kind: z.literal("computed"),
    fn: z.enum(EVAL_FUNCTIONS),
    args: z.record(z.unknown()),
    tolerance: toleranceSchema,
  }),
]);

export type AnswerSpec = z.infer<typeof answerSpecSchema>;

const readStep = z.object({
  id: stepId,
  type: z.literal("READ"),
  body: z.string().min(1),
});

const taskStep = z.object({
  id: stepId,
  type: z.literal("TASK"),
  body: z.string().min(1),
  target: dashboardTargetSchema,
  hint: z.string().optional(),
  allowAutoSet: z.boolean().default(true),
});

const mcStep = z.object({
  id: stepId,
  type: z.literal("QUESTION_MC"),
  prompt: z.string().min(1),
  options: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .min(3)
    .max(5),
  answer: z.string().min(1),
  points: z.number().positive(),
  tries: z.number().int().positive().default(2),
  explanation: z.string().min(1),
  hint: z.string().optional(),
});

const numericStep = z.object({
  id: stepId,
  type: z.literal("QUESTION_NUMERIC"),
  prompt: z.string().min(1),
  unit: z.string().min(1),
  answer: answerSpecSchema,
  points: z.number().positive(),
  tries: z.number().int().positive().default(3),
  explanation: z.string().min(1),
  hint: z.string().optional(),
});

const shortStep = z.object({
  id: stepId,
  type: z.literal("QUESTION_SHORT"),
  prompt: z.string().min(1),
  rubric: z.object({
    // Outer array is the required concepts; inner is that concept's synonyms.
    mustInclude: z.array(z.array(z.string().min(1)).min(1)).min(1),
    minWords: z.number().int().nonnegative(),
  }),
  points: z.number().positive(),
  tries: z.number().int().positive().default(2),
  explanation: z.string().min(1),
});

export const stepSchema = z.discriminatedUnion("type", [
  readStep,
  taskStep,
  mcStep,
  numericStep,
  shortStep,
]);

export type Step = z.infer<typeof stepSchema>;
export type ReadStep = z.infer<typeof readStep>;
export type TaskStep = z.infer<typeof taskStep>;
export type McStep = z.infer<typeof mcStep>;
export type NumericStep = z.infer<typeof numericStep>;
export type ShortStep = z.infer<typeof shortStep>;

export const lessonContentSchema = z
  .object({
    objectives: z.array(z.string().min(1)).min(3).max(5),
    steps: z.array(stepSchema).min(1),
    sources: z.array(z.string().min(1)).min(1),
  })
  .superRefine((content, ctx) => {
    const ids = new Set<string>();
    for (const step of content.steps) {
      if (ids.has(step.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate step id ${step.id}` });
      }
      ids.add(step.id);
    }

    // Section 19.1: a question is locked behind the task immediately before it,
    // so a question that is not preceded by one can never be reached.
    content.steps.forEach((step, index) => {
      if (!isQuestion(step)) return;
      const previous = content.steps[index - 1];
      const anyTaskBefore = content.steps.slice(0, index).some((s) => s.type === "TASK");
      if (!previous || !anyTaskBefore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Question ${step.id} has no task before it to unlock it`,
        });
      }
    });

    if (content.steps.filter(isQuestion).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A lesson needs at least one question" });
    }
  });

export type LessonContent = z.infer<typeof lessonContentSchema>;

export type QuestionStep = McStep | NumericStep | ShortStep;

export function isQuestion(step: Step): step is QuestionStep {
  return (
    step.type === "QUESTION_MC" ||
    step.type === "QUESTION_NUMERIC" ||
    step.type === "QUESTION_SHORT"
  );
}

export function maxScoreOf(content: LessonContent): number {
  return content.steps.filter(isQuestion).reduce((sum, s) => sum + s.points, 0);
}

/**
 * Section 10.7. The client copy of a lesson, with every answer key removed.
 * Stripping happens here, on the server, so no route can forget to do it.
 */
export function toClientLesson(content: LessonContent) {
  return {
    objectives: content.objectives,
    sources: content.sources,
    steps: content.steps.map((step) => {
      switch (step.type) {
        case "READ":
          return step;
        case "TASK":
          return step;
        case "QUESTION_MC":
          return {
            id: step.id,
            type: step.type,
            prompt: step.prompt,
            options: step.options,
            points: step.points,
            tries: step.tries,
            hint: step.hint,
          };
        case "QUESTION_NUMERIC":
          return {
            id: step.id,
            type: step.type,
            prompt: step.prompt,
            unit: step.unit,
            points: step.points,
            tries: step.tries,
            hint: step.hint,
          };
        case "QUESTION_SHORT":
          return {
            id: step.id,
            type: step.type,
            prompt: step.prompt,
            minWords: step.rubric.minWords,
            points: step.points,
            tries: step.tries,
          };
      }
    }),
  };
}
