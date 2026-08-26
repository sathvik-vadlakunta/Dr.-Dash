"use client";

import { useState } from "react";
import { Feedback } from "@/components/lesson/QuestionMultipleChoice";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { AnswerResponse } from "@/types";

/**
 * Section 19.4. The input is forgiving about `%`, `$`, commas, and a leading
 * sign, and an unreadable answer does not cost a try: the student is being
 * asked to read a chart, not to guess a format.
 */
export interface QuestionNumericProps {
  prompt: string;
  unit: string;
  points: number;
  tries: number;
  hint?: string;
  result: AnswerResponse | null;
  disabled: boolean;
  onAnswer: (response: string) => Promise<void>;
}

export function QuestionNumeric({
  prompt,
  unit,
  points,
  tries,
  hint,
  result,
  disabled,
  onAnswer,
}: QuestionNumericProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const settled = result?.isCorrect === true || result?.triesRemaining === 0;

  async function submit() {
    if (value.trim() === "") return;
    setBusy(true);
    try {
      await onAnswer(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink">{prompt}</p>

      <Field
        label={`Your answer, in ${unit}`}
        value={value}
        inputMode="decimal"
        disabled={disabled || settled}
        className="font-mono text-data"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />

      {hint && !settled ? <p className="text-small text-ink-muted">Hint: {hint}</p> : null}

      {settled ? null : (
        <Button
          variant="primary"
          className="self-start"
          disabled={disabled || busy || value.trim() === ""}
          onClick={() => void submit()}
        >
          Answer
        </Button>
      )}

      <Feedback result={result} points={points} tries={tries} />
    </div>
  );
}

export default QuestionNumeric;
