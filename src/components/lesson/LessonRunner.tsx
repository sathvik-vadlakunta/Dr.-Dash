"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { LessonStep } from "@/components/lesson/LessonStep";
import { DashboardWorkspace } from "@/components/chart/DashboardWorkspace";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import type {
  AnswerResponse,
  ApiErrorBody,
  AttemptDto,
  CategoryNodeDto,
  ClientLesson,
  SubmitResponse,
} from "@/types";
import { isQuestionStep } from "@/types";

/**
 * Section 19.8. Two panes: the lesson on the left, the live product on the
 * right. The student manipulates the real dashboard, not a mock, which is the
 * whole point of alternating a task with a question about it.
 */

export interface LessonRunnerProps {
  lesson: ClientLesson;
  attempt: AttemptDto;
  categories: CategoryNodeDto[];
  labels: Record<string, string>;
  courseName?: string | null;
  courseId?: string | null;
}

export function LessonRunner({
  lesson,
  attempt,
  categories,
  labels,
  courseName,
  courseId,
}: LessonRunnerProps) {
  const toast = useToast();
  const steps = lesson.content.steps;

  const [index, setIndex] = useState(Math.min(attempt.currentStep, steps.length - 1));
  const [results, setResults] = useState<Record<string, AnswerResponse>>({});
  const [taskSatisfied, setTaskSatisfied] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState<SubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const savedStep = useRef(attempt.currentStep);

  const labelOf = useCallback((slug: string) => labels[slug] ?? slug, [labels]);

  const questionCount = steps.filter(isQuestionStep).length;

  /**
   * Section 19.1. A question is locked until the task immediately before it has
   * a satisfied state check. "Set it for me" is allowed and costs nothing: the
   * task exists for exposure, and the question is what is graded.
   */
  const lockedFor = useCallback(
    (position: number): boolean => {
      const step = steps[position];
      if (!step || !isQuestionStep(step)) return false;
      for (let i = position - 1; i >= 0; i -= 1) {
        const previous = steps[i];
        if (!previous) break;
        if (previous.type === "TASK") return taskSatisfied[previous.id] !== true;
        if (isQuestionStep(previous)) continue;
      }
      return false;
    },
    [steps, taskSatisfied],
  );

  const saveProgress = useCallback(
    async (next: number) => {
      if (next === savedStep.current) return;
      savedStep.current = next;
      await fetch(`/api/v1/attempts/${attempt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentStep: next }),
      }).catch(() => undefined);
    },
    [attempt.id],
  );

  const answer = useCallback(
    async (stepId: string, response: string) => {
      const res = await fetch(`/api/v1/attempts/${attempt.id}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, response }),
      });

      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }

      const body = (await res.json()) as { data: AnswerResponse };
      setResults((current) => ({ ...current, [stepId]: body.data }));
    },
    [attempt.id, toast],
  );

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/attempts/${attempt.id}/submit`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      const body = (await res.json()) as { data: SubmitResponse };
      setSubmitted(body.data);
    } finally {
      setBusy(false);
    }
  }

  const step = steps[index];
  const locked = lockedFor(index);
  const answered = step ? results[step.id] : undefined;
  const canAdvance =
    !step ||
    !isQuestionStep(step) ||
    answered?.isCorrect === true ||
    answered?.triesRemaining === 0;

  const initialState = useMemo(() => undefined, []);

  if (submitted) {
    return (
      <ResultsScreen
        lesson={lesson}
        result={submitted}
        courseName={courseName}
        courseId={courseId}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr]">
      <section
        aria-label="Lesson"
        className="flex max-h-[calc(100vh-56px)] flex-col gap-4 overflow-y-auto border-r border-rule p-4"
      >
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title">{lesson.title}</h1>
          <p className="font-mono text-data text-ink-muted">
            Step {index + 1} of {steps.length} · {questionCount} questions ·{" "}
            {lesson.maxScore} points
          </p>
          <div
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            className="h-1 w-full bg-surface-sunken"
          >
            <div
              className="h-1 bg-accent transition-[width] duration-180 ease-system motion-reduce:transition-none"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Previous steps collapse to one line, so the current one has the page. */}
        {index > 0 ? (
          <details className="border-y border-rule py-2">
            <summary className="cursor-pointer text-small text-ink-muted">
              {index} earlier step{index === 1 ? "" : "s"}
            </summary>
            <ol className="mt-2 flex flex-col gap-1">
              {steps.slice(0, index).map((s, i) => (
                <li key={s.id} className="text-small text-ink-muted">
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() => setIndex(i)}
                  >
                    {summarize(s)}
                  </button>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        {step ? (
          <LessonStep
            key={step.id}
            step={step}
            result={answered ?? null}
            locked={locked}
            labelOf={labelOf}
            onAnswer={answer}
            onTaskSatisfied={(stepId, satisfied) =>
              setTaskSatisfied((current) =>
                current[stepId] === satisfied ? current : { ...current, [stepId]: satisfied },
              )
            }
          />
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-rule pt-4">
          <Button disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            Back
          </Button>

          {index < steps.length - 1 ? (
            <Button
              variant="primary"
              disabled={!canAdvance}
              onClick={() => {
                const next = Math.min(steps.length - 1, index + 1);
                setIndex(next);
                void saveProgress(next);
              }}
            >
              Next
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void submit()}>
              Submit
            </Button>
          )}
        </div>
      </section>

      <section aria-label="Dashboard" className="min-w-0">
        <DashboardWorkspace
          categories={categories}
          initialState={initialState}
          height={420}
        />
      </section>
    </div>
  );
}

function summarize(step: ClientLesson["content"]["steps"][number]): string {
  switch (step.type) {
    case "READ":
      return step.body.slice(0, 60) + (step.body.length > 60 ? "…" : "");
    case "TASK":
      return `Task: ${step.body.slice(0, 50)}${step.body.length > 50 ? "…" : ""}`;
    default:
      return `Question: ${step.prompt.slice(0, 50)}${step.prompt.length > 50 ? "…" : ""}`;
  }
}

function ResultsScreen({
  lesson,
  result,
  courseName,
  courseId,
}: {
  lesson: ClientLesson;
  result: SubmitResponse;
  courseName?: string | null;
  courseId?: string | null;
}) {
  const percent = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="font-display text-display-m">{lesson.title}</h1>
        <p className="mt-2 font-mono text-data-lg text-ink">
          {result.score} of {result.maxScore} · {percent.toFixed(0)}%
        </p>
      </div>

      <Table
        caption="Every question, your answer, and why"
        head={["Question", "Your answer", "Points"]}
        numericColumns={[2]}
        rows={result.perStep.map((s) => [
          <span key={s.stepId} className="flex flex-col gap-1">
            <span className="text-small text-ink">{s.prompt}</span>
            <span className="text-small text-ink-muted">{s.explanation}</span>
          </span>,
          <span key={`${s.stepId}-a`} className="font-mono text-data">
            {typeof s.response === "string" ? s.response : JSON.stringify(s.response)}
            {s.isCorrect ? " ✓" : " ✕"}
          </span>,
          `${s.pointsEarned} / ${s.pointsPossible}`,
        ])}
      />

      <div className="flex gap-3">
        <Link href="/lessons" className="text-accent underline">
          Back to lessons
        </Link>
        {courseId ? (
          <Link href={`/courses/${courseId}`} className="text-accent underline">
            Back to {courseName ?? "your course"}
          </Link>
        ) : null}
      </div>
    </main>
  );
}

export default LessonRunner;
