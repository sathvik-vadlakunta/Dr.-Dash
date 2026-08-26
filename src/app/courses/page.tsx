import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { JoinCodeCard } from "@/components/course/JoinCodeCard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Courses" };

/**
 * Section 16.6. Instructors see what they teach; everyone sees what they are
 * enrolled in, with their own scores and nobody else's.
 */
export default async function CoursesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/courses");

  const canTeach = session.user.role === "INSTRUCTOR" || session.user.role === "ADMIN";

  const [taught, enrolled] = await Promise.all([
    canTeach
      ? prisma.course.findMany({
          where: { instructorId: session.user.id },
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { enrollments: true, assignments: true } } },
        })
      : Promise.resolve([]),
    prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "ACTIVE" },
      include: {
        course: {
          include: {
            instructor: { select: { name: true } },
            assignments: {
              include: { lesson: { select: { slug: true, title: true, maxScore: true } } },
            },
          },
        },
      },
    }),
  ]);

  const myAttempts = await prisma.lessonAttempt.findMany({
    where: { userId: session.user.id, status: "SUBMITTED" },
    select: { assignmentId: true, score: true, maxScore: true, submittedAt: true },
  });

  return (
    <main className="mx-auto flex max-w-[80ch] flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-display-m">Courses</h1>
        <div className="flex gap-4 text-small">
          {canTeach ? (
            <Link href="/courses/new" className="text-accent underline">
              New course
            </Link>
          ) : null}
          <Link href="/courses/join" className="text-accent underline">
            Join a course
          </Link>
        </div>
      </div>

      {canTeach ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-title">Teaching</h2>
          {taught.length === 0 ? (
            <p className="text-small text-ink-muted">
              No courses yet. Create one and share its join code.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {taught.map((course) => (
                <li key={course.id} className="rounded-card border border-rule p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/courses/${course.id}`} className="font-display text-title text-ink">
                      {course.name}
                    </Link>
                    <span className="font-mono text-data text-ink-muted">
                      {course.term} · {course._count.enrollments} students ·{" "}
                      {course._count.assignments} assignments
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <JoinCodeCard code={course.joinCode} />
                    <Link href={`/courses/${course.id}/gradebook`} className="text-small text-accent underline">
                      Gradebook
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-title">Enrolled</h2>
        {enrolled.length === 0 ? (
          <p className="text-small text-ink-muted">
            Not in a course yet. Ask your instructor for a join code.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {enrolled.map(({ course }) => (
              <li key={course.id} className="rounded-card border border-rule p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/courses/${course.id}`} className="font-display text-title text-ink">
                    {course.name}
                  </Link>
                  <span className="font-mono text-data text-ink-muted">
                    {course.term} · {course.instructor.name}
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {course.assignments.map((assignment) => {
                    const mine = myAttempts.find((a) => a.assignmentId === assignment.id);
                    const late =
                      assignment.dueAt && mine?.submittedAt
                        ? mine.submittedAt > assignment.dueAt
                        : false;

                    return (
                      <li key={assignment.id} className="flex flex-wrap items-baseline gap-3">
                        <Link
                          href={`/lessons/${assignment.lesson.slug}`}
                          className="text-small text-accent underline"
                        >
                          {assignment.lesson.title}
                        </Link>
                        <span className="font-mono text-data text-ink-muted">
                          {assignment.dueAt
                            ? `due ${assignment.dueAt.toISOString().slice(0, 10)}`
                            : "no due date"}
                          {mine
                            ? ` · ${mine.score} of ${mine.maxScore}${late ? " · late" : ""}`
                            : " · not started"}
                        </span>
                      </li>
                    );
                  })}
                  {course.assignments.length === 0 ? (
                    <li className="text-small text-ink-muted">Nothing assigned yet.</li>
                  ) : null}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
