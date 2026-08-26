"use client";

import { QuestionMultipleChoice } from "@/components/lesson/QuestionMultipleChoice";
import { QuestionNumeric } from "@/components/lesson/QuestionNumeric";
import { QuestionShortAnswer } from "@/components/lesson/QuestionShortAnswer";
import { StateCheckBadge } from "@/components/lesson/StateCheckBadge";
import type { AnswerResponse, ClientStep } from "@/types";

/**
 * One step. A question is locked until the task before it has a satisfied state
 * check (Section 19.1), which is why `locked` is passed down rather than
 * inferred here.
 */
export interface LessonStepProps {
  step: ClientStep;
  result: AnswerResponse | null;
  locked: boolean;
  labelOf: (slug: string) => string;
  onAnswer: (stepId: string, response: string) => Promise<void>;
  onTaskSatisfied: (stepId: string, satisfied: boolean) => void;
}

export function LessonStep({
  step,
  result,
  locked,
  labelOf,
  onAnswer,
  onTaskSatisfied,
}: LessonStepProps) {
  switch (step.type) {
    case "READ":
      return <p className="text-body text-ink">{step.body}</p>;

    case "TASK":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{step.body}</p>
          <StateCheckBadge
            target={step.target}
            allowAutoSet={step.allowAutoSet}
            labelOf={labelOf}
            onSatisfiedChange={(satisfied) => onTaskSatisfied(step.id, satisfied)}
          />
          {step.hint ? <p className="text-small text-ink-muted">Hint: {step.hint}</p> : null}
        </div>
      );

    case "QUESTION_MC":
      return (
        <>
          {locked ? <LockedNotice /> : null}
          <QuestionMultipleChoice
            stepId={step.id}
            prompt={step.prompt}
            options={step.options}
            points={step.points}
            tries={step.tries}
            hint={step.hint}
            result={result}
            disabled={locked}
            onAnswer={(response) => onAnswer(step.id, response)}
          />
        </>
      );

    case "QUESTION_NUMERIC":
      return (
        <>
          {locked ? <LockedNotice /> : null}
          <QuestionNumeric
            prompt={step.prompt}
            unit={step.unit}
            points={step.points}
            tries={step.tries}
            hint={step.hint}
            result={result}
            disabled={locked}
            onAnswer={(response) => onAnswer(step.id, response)}
          />
        </>
      );

    case "QUESTION_SHORT":
      return (
        <>
          {locked ? <LockedNotice /> : null}
          <QuestionShortAnswer
            prompt={step.prompt}
            minWords={step.minWords}
            points={step.points}
            tries={step.tries}
            result={result}
            disabled={locked}
            onAnswer={(response) => onAnswer(step.id, response)}
          />
        </>
      );
  }
}

function LockedNotice() {
  return (
    <p data-testid="question-locked" className="text-small text-warn">
      Finish the task above first. The question is about what you will see.
    </p>
  );
}

export default LessonStep;
