"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AnswerResponse } from "@/types";

export interface QuestionMultipleChoiceProps {
  stepId: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  points: number;
  tries: number;
  hint?: string;
  result: AnswerResponse | null;
  disabled: boolean;
  onAnswer: (response: string) => Promise<void>;
}

export function QuestionMultipleChoice({
  stepId,
  prompt,
  options,
  points,
  tries,
  hint,
  result,
  disabled,
  onAnswer,
}: QuestionMultipleChoiceProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settled = result?.isCorrect === true || result?.triesRemaining === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink">{prompt}</p>

      <fieldset className="flex flex-col gap-2" disabled={disabled || settled}>
        <legend className="sr-only">{prompt}</legend>
        {options.map((option) => (
          <label key={option.id} className="flex items-start gap-2 text-small text-ink">
            <input
              type="radio"
              name={stepId}
              value={option.id}
              checked={choice === option.id}
              onChange={() => setChoice(option.id)}
            />
            {option.text}
          </label>
        ))}
      </fieldset>

      {hint && !settled ? <p className="text-small text-ink-muted">Hint: {hint}</p> : null}

      {settled ? null : (
        <Button
          variant="primary"
          className="self-start"
          disabled={disabled || busy || choice === null}
          onClick={async () => {
            if (!choice) return;
            setBusy(true);
            try {
              await onAnswer(choice);
            } finally {
              setBusy(false);
            }
          }}
        >
          Answer
        </Button>
      )}

      <Feedback result={result} points={points} tries={tries} />
    </div>
  );
}

export function Feedback({
  result,
  points,
  tries,
}: {
  result: AnswerResponse | null;
  points: number;
  tries: number;
}) {
  if (!result) {
    return (
      <p className="font-mono text-data text-ink-muted">
        {points} points · {tries} tries
      </p>
    );
  }

  return (
    <div
      data-testid="answer-feedback"
      className={`flex flex-col gap-1 rounded-control border p-3 ${
        result.isCorrect ? "border-ok" : "border-warn"
      }`}
    >
      <p className={`text-small font-medium ${result.isCorrect ? "text-ok" : "text-warn"}`}>
        {result.feedback}
      </p>
      <p className="font-mono text-data text-ink-muted">
        {result.pointsEarned} of {result.pointsPossible} points
        {result.isCorrect ? "" : ` · ${result.triesRemaining} tries left`}
      </p>
      {result.explanation ? (
        <p className="mt-1 text-small text-ink">{result.explanation}</p>
      ) : null}
      {result.correctResponse !== undefined && !result.isCorrect ? (
        <p className="font-mono text-data text-ink">Answer: {String(result.correctResponse)}</p>
      ) : null}
    </div>
  );
}

export default QuestionMultipleChoice;
