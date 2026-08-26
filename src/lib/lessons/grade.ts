import { evaluate, parseNumericResponse, type EvaluatorContext } from "@/lib/lessons/evaluate";
import type { AnswerSpec, QuestionStep, Tolerance } from "@/lib/lessons/schema";

/**
 * Section 19.5. The grades exist mainly to make sure the student actually does
 * the tasks, so retries are generous: a second try still earns 60% and a third
 * 30%. What is not generous is skipping the task, because the question is
 * locked until its state check passes.
 */

export const TRY_FACTORS = [1, 0.6, 0.3];

export function pointsFor(points: number, triesUsed: number): number {
  const factor = TRY_FACTORS[triesUsed - 1] ?? 0;
  return Math.round(points * factor * 100) / 100;
}

/**
 * Section 19.4. A floor on the effective tolerance keeps answers near zero
 * gradeable: 3% of 0.1 is not a window anyone can hit.
 */
export const TOLERANCE_FLOOR = 0.05;

export function effectiveTolerance(tolerance: Tolerance, expected: number): number {
  switch (tolerance.type) {
    case "absolute":
      return tolerance.value;
    case "percentagePoints":
      return Math.max(tolerance.value, TOLERANCE_FLOOR);
    case "relative":
      return Math.max(Math.abs(expected) * tolerance.value, TOLERANCE_FLOOR);
  }
}

export interface GradeResult {
  isCorrect: boolean;
  feedback: string;
  explanation: string | null;
  correctResponse?: string | number;
  /** Set when the answer could not be read, so the try is not consumed. */
  consumedTry: boolean;
}

const NOT_PUBLISHED_YET =
  "This period is not published yet, so this question was credited.";

async function expectedValue(
  answer: AnswerSpec,
  ctx: EvaluatorContext,
): Promise<{ value: number | string | null; tolerance: number | null }> {
  switch (answer.kind) {
    case "literal":
      // Section 19.7 lesson 2 q5: a literal carries a default absolute
      // tolerance, so "no change" can be answered as 0 or 0.0.
      return { value: answer.value, tolerance: TOLERANCE_FLOOR };
    case "range":
      return { value: null, tolerance: null };
    case "computed": {
      const value = await evaluate(answer.fn, answer.args, ctx);
      const tolerance =
        typeof value === "number" ? effectiveTolerance(answer.tolerance, value) : null;
      return { value, tolerance };
    }
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  const normalized = normalizeText(text);
  return normalized === "" ? 0 : normalized.split(" ").length;
}

export interface GradeInput {
  step: QuestionStep;
  response: unknown;
  ctx: EvaluatorContext;
  /** Tries already used, before this attempt. */
  previousTries: number;
  onEvaluatorNull?: (fn: string) => void;
}

export async function gradeAnswer(input: GradeInput): Promise<GradeResult> {
  const { step, response, ctx } = input;
  const isLastTry = input.previousTries + 1 >= step.tries;

  if (step.type === "QUESTION_MC") {
    const given = typeof response === "string" ? response : "";
    const isCorrect = given === step.answer;
    return {
      isCorrect,
      feedback: isCorrect ? "Correct." : "Not quite.",
      explanation: isCorrect || isLastTry ? step.explanation : null,
      ...(isCorrect || isLastTry ? { correctResponse: step.answer } : {}),
      consumedTry: true,
    };
  }

  if (step.type === "QUESTION_NUMERIC") {
    const raw = typeof response === "string" ? response : String(response ?? "");
    const given = parseNumericResponse(raw);
    if (given === null) {
      // Rejecting an unreadable answer must not cost a try.
      return {
        isCorrect: false,
        feedback: "Enter a number.",
        explanation: null,
        consumedTry: false,
      };
    }

    if (step.answer.kind === "range") {
      const isCorrect = given >= step.answer.min && given <= step.answer.max;
      return {
        isCorrect,
        feedback: isCorrect ? "Correct." : "Not quite.",
        explanation: isCorrect || isLastTry ? step.explanation : null,
        ...(isCorrect || isLastTry
          ? { correctResponse: `${step.answer.min} to ${step.answer.max}` }
          : {}),
        consumedTry: true,
      };
    }

    const { value, tolerance } = await expectedValue(step.answer, ctx);

    if (value === null) {
      // Section 19.4: data that is not published yet is credited, not marked
      // wrong. A revision to the source must never fail a student.
      if (step.answer.kind === "computed") input.onEvaluatorNull?.(step.answer.fn);
      return {
        isCorrect: true,
        feedback: NOT_PUBLISHED_YET,
        explanation: step.explanation,
        consumedTry: true,
      };
    }

    if (typeof value === "string") {
      // An `argmax`/`argmin` answer is a date; compare at year granularity when
      // the question asks for a year.
      const expectedYear = value.slice(0, 4);
      const isCorrect =
        step.unit.toLowerCase() === "year"
          ? String(Math.trunc(given)) === expectedYear
          : String(given) === value;
      return {
        isCorrect,
        feedback: isCorrect ? "Correct." : "Not quite.",
        explanation: isCorrect || isLastTry ? step.explanation : null,
        ...(isCorrect || isLastTry
          ? { correctResponse: step.unit.toLowerCase() === "year" ? expectedYear : value }
          : {}),
        consumedTry: true,
      };
    }

    const isCorrect = Math.abs(given - value) <= (tolerance ?? TOLERANCE_FLOOR);
    return {
      isCorrect,
      feedback: isCorrect ? "Correct." : "Not quite.",
      explanation: isCorrect || isLastTry ? step.explanation : null,
      ...(isCorrect || isLastTry ? { correctResponse: Math.round(value * 100) / 100 } : {}),
      consumedTry: true,
    };
  }

  // QUESTION_SHORT
  const text = typeof response === "string" ? response : "";
  const normalized = normalizeText(text);
  const words = countWords(text);

  const missing = step.rubric.mustInclude.filter(
    (synonyms) => !synonyms.some((s) => normalized.includes(normalizeText(s))),
  ).length;

  const isCorrect = missing === 0 && words >= step.rubric.minWords;

  let feedback: string;
  if (isCorrect) {
    feedback = "Correct.";
  } else if (words < step.rubric.minWords) {
    feedback = `Write at least ${step.rubric.minWords} words.`;
  } else {
    // Naming which concepts are missing would hand over the answer.
    feedback = `Your answer is missing ${missing} of the ideas we are looking for. Try again.`;
  }

  return {
    isCorrect,
    feedback,
    explanation: isCorrect || isLastTry ? step.explanation : null,
    consumedTry: true,
  };
}
