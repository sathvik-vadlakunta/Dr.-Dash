"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  GradebookTable,
  type GradebookAssignment,
  type GradebookStudent,
} from "@/components/course/GradebookTable";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody } from "@/types";

/**
 * Section 16.6 and 10.8. The brief says the instructor may use the grades if
 * they wish, so this page reports and never decides: late is a flag, a missing
 * score is a blank, and the CSV says the same thing the table does.
 */
export default function GradebookPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Gradebook - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <Gradebook />
    </ToastProvider>
  );
}

function Gradebook() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const toast = useToast();

  const [students, setStudents] = useState<GradebookStudent[]>([]);
  const [assignments, setAssignments] = useState<GradebookAssignment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/courses/${courseId}/gradebook`);
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      toast.show(body.error.message, "error");
      setLoaded(true);
      return;
    }
    const body = (await res.json()) as {
      data: {
        students: GradebookStudent[];
        assignments: Array<GradebookAssignment & { lessonTitle: string }>;
      };
    };
    setStudents(body.data.students);
    setAssignments(body.data.assignments);
    setLoaded(true);
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-[110ch] flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-display-m">Gradebook</h1>
        <div className="flex items-center gap-4">
          <Link href={`/courses/${courseId}`} className="text-small text-accent underline">
            Back to the course
          </Link>
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = `/api/v1/courses/${courseId}/gradebook?format=csv`;
            }}
          >
            Download CSV
          </Button>
        </div>
      </div>

      {loaded ? (
        <GradebookTable students={students} assignments={assignments} />
      ) : (
        <div className="skeleton h-[240px] w-full rounded-card" aria-hidden />
      )}
    </main>
  );
}
