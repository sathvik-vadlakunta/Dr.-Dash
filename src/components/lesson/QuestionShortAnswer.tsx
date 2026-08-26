"use client";

import { useState } from "react";
import { Feedback } from "@/components/lesson/QuestionMultipleChoice";
import { Button } from "@/components/ui/Button";
import type { AnswerResponse } from "@/types";

/**
 * Section 19.5. Graded on concepts, not on wording, and the feedback names how
 * many ideas are missing without naming which: saying which would hand over
 * the answer.
 */
export interface QuestionShortAnswerProps {
  prompt: string;
  minWords: number;
  points: number;
  tries: number;
  result: AnswerResponse | null;
  disabled: boolean;
  onAnswer: (response: string) => Promise<void>;
}

export function QuestionShortAnswer({
  prompt,
  minWords,
  points,
  tries,
  result,
  disabled,
  onAnswer,
}: QuestionShortAnswerProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const settled = result?.isCorrect === true || result?.triesRemaining === 0;
  const words = value.trim() === "" ? 0 : value.trim().split(/\s+/).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink">{prompt}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="short-answer" className="text-small font-medium text-ink">
          Your answer
        </label>
        <textarea
          id="short-answer"
          rows={5}
          value={value}
          disabled={disabled || settled}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-control border border-rule-strong bg-surface p-3 text-body text-ink disabled:opacity-50"
        />
        <p className="font-mono text-data text-ink-muted">
          {words} of at least {minWords} words
        </p>
      </div>

      {settled ? null : (
        <Button
          variant="primary"
          className="self-start"
          disabled={disabled || busy || value.trim() === ""}
          onClick={async () => {
            setBusy(true);
            try {
              await onAnswer(value);
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

export default QuestionShortAnswer;
