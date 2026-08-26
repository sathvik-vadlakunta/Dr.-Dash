"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { JoinCodeCard } from "@/components/course/JoinCodeCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { ApiErrorBody, LessonListItem } from "@/types";

/**
 * Section 16.6. The course page: the roster and the assignment list for an
 * instructor, the assignment list and the student's own scores for everyone
 * else.
 */

interface CourseDto {
  id: string;
  name: string;
  term: string;
  joinCode: string | null;
  instructorId: string;
  instructor: { id: string; name: string };
  assignments: Array<{
    id: string;
    dueAt: string | null;
    points: number;
    maxAttempts: number;
    lesson: { slug: string; title: string; maxScore: number };
  }>;
  myAttempts: Array<{
    assignmentId: string | null;
    score: number;
    maxScore: number;
    submittedAt: string | null;
  }>;
  _count: { enrollments: number };
}

interface RosterRow {
  id: string;
  status: string;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

export default function CoursePage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Course - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <Course />
    </ToastProvider>
  );
}

function Course() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const toast = useToast();

  const [course, setCourse] = useState<CourseDto | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [lessonSlug, setLessonSlug] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/courses/${courseId}`);
    if (!res.ok) return;
    const body = (await res.json()) as { data: CourseDto };
    setCourse(body.data);

    // Only an instructor can read the roster; a 404 here is the answer, not an
    // error to shout about.
    const rosterRes = await fetch(`/api/v1/courses/${courseId}/enrollments`);
    if (rosterRes.ok) {
      const rosterBody = (await rosterRes.json()) as { data: RosterRow[] };
      setRoster(rosterBody.data);
    }

    const lessonsRes = await fetch("/api/v1/lessons");
    if (lessonsRes.ok) {
      const lessonsBody = (await lessonsRes.json()) as { data: LessonListItem[] };
      setLessons(lessonsBody.data);
      setLessonSlug((current) => current || (lessonsBody.data[0]?.slug ?? ""));
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign() {
    const lesson = lessons.find((l) => l.slug === lessonSlug);
    if (!lesson) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/v1/courses/${courseId}/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59Z`).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        toast.show(body.error.message, "error");
        return;
      }
      toast.show("Assigned.");
      setDueAt("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function drop(userId: string) {
    const res = await fetch(`/api/v1/courses/${courseId}/enrollments/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      toast.show(body.error.message, "error");
      return;
    }
    toast.show("Dropped. Their scores are kept.");
    await load();
  }

  if (!course) {
    return (
      <main className="mx-auto max-w-[80ch] px-4 py-8">
        <div className="skeleton h-[200px] w-full rounded-card" aria-hidden />
      </main>
    );
  }

  const isInstructor = roster !== null;

  return (
    <main className="mx-auto flex max-w-[90ch] flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-display-m">{course.name}</h1>
          <p className="font-mono text-data text-ink-muted">
            {course.term} · {course.instructor.name} · {course._count.enrollments} students
          </p>
        </div>
        {course.joinCode ? <JoinCodeCard code={course.joinCode} /> : null}
      </div>

      {isInstructor ? (
        <Link href={`/courses/${courseId}/gradebook`} className="text-small text-accent underline">
          Open the gradebook
        </Link>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-title">Assignments</h2>
        {course.assignments.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing assigned yet.</p>
        ) : (
          <Table
            head={["Lesson", "Due", "Attempts", isInstructor ? "Points" : "Your score"]}
            rows={course.assignments.map((a) => {
              const mine = course.myAttempts.find((m) => m.assignmentId === a.id);
              return [
                <Link key={a.id} href={`/lessons/${a.lesson.slug}`} className="text-accent underline">
                  {a.lesson.title}
                </Link>,
                a.dueAt ? a.dueAt.slice(0, 10) : "—",
                String(a.maxAttempts),
                isInstructor
                  ? String(a.lesson.maxScore)
                  : mine
                    ? `${mine.score} of ${mine.maxScore}`
                    : "not started",
              ];
            })}
          />
        )}

        {isInstructor ? (
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Assign a lesson"
              value={lessonSlug}
              onChange={(e) => setLessonSlug(e.target.value)}
              options={lessons.map((l) => ({ value: l.slug, label: l.title }))}
            />
            <Field
              label="Due date"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
            <Button variant="primary" disabled={busy || !lessonSlug} onClick={() => void assign()}>
              Assign
            </Button>
          </div>
        ) : null}
      </section>

      {isInstructor && roster ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title">Roster</h2>
          {roster.length === 0 ? (
            <p className="text-small text-ink-muted">Nobody has joined yet.</p>
          ) : (
            <Table
              head={["Student", "Email", "Joined", "Status", ""]}
              rows={roster.map((r) => [
                r.user.name,
                r.user.email,
                r.joinedAt.slice(0, 10),
                r.status.toLowerCase(),
                r.status === "ACTIVE" ? (
                  <Button
                    key={r.id}
                    variant="ghost"
                    className="px-2"
                    onClick={() => void drop(r.user.id)}
                  >
                    Drop
                  </Button>
                ) : (
                  ""
                ),
              ])}
            />
          )}
        </section>
      ) : null}
    </main>
  );
}
