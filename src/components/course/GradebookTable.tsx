"use client";

import { Table } from "@/components/ui/Table";

/**
 * Section 10.8. A missing score is an empty cell, never a zero: to an
 * instructor those mean different things, and the late flag reports rather
 * than deducts.
 */

export interface GradebookAssignment {
  id: string;
  lessonTitle: string;
  maxScore: number;
  dueAt: string | null;
}

export interface GradebookStudent {
  userId: string;
  name: string;
  email: string;
  scores: Record<
    string,
    { score: number; maxScore: number; submittedAt: string | null; late: boolean }
  >;
}

export function GradebookTable({
  students,
  assignments,
}: {
  students: GradebookStudent[];
  assignments: GradebookAssignment[];
}) {
  const totalPossible = assignments.reduce((sum, a) => sum + a.maxScore, 0);

  if (students.length === 0) {
    return <p className="text-small text-ink-muted">Nobody has joined yet.</p>;
  }

  return (
    <Table
      caption={`${students.length} students · ${assignments.length} assignments · ${totalPossible} points`}
      head={["Student", "Email", ...assignments.map((a) => a.lessonTitle), "Total", "Percent"]}
      numericColumns={assignments.map((_, i) => i + 2).concat([assignments.length + 2, assignments.length + 3])}
      rows={students.map((student) => {
        const total = assignments.reduce((sum, a) => sum + (student.scores[a.id]?.score ?? 0), 0);
        const percent = totalPossible > 0 ? ((total / totalPossible) * 100).toFixed(1) : "";

        return [
          student.name,
          student.email,
          ...assignments.map((a) => {
            const score = student.scores[a.id];
            if (!score) return "";
            return score.late ? `${score.score} (late)` : String(score.score);
          }),
          String(total),
          percent,
        ];
      })}
    />
  );
}

export default GradebookTable;
