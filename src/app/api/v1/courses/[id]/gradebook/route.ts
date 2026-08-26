import { requireCourseInstructor } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.8. The brief says the instructor may use the grades if they wish,
 * so the gradebook reports and never decides: a late submission is flagged,
 * never auto-deducted, and a missing score is an empty cell, never a zero.
 */

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function slugifyCourse(name: string, term: string): string {
  return `${name} ${term}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const GET = withRoute(
  "courses.gradebook",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireCourseInstructor(id);

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { lesson: { select: { title: true, slug: true, maxScore: true } } },
          orderBy: { createdAt: "asc" },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!course) throw HttpError.notFound("That course does not exist.");

    const attempts = await prisma.lessonAttempt.findMany({
      where: {
        assignmentId: { in: course.assignments.map((a) => a.id) },
        status: "SUBMITTED",
      },
      select: {
        assignmentId: true,
        userId: true,
        score: true,
        maxScore: true,
        submittedAt: true,
      },
      orderBy: { score: "desc" },
    });

    // A student may have several attempts; the gradebook reports their best.
    const best = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      const key = `${attempt.userId}:${attempt.assignmentId}`;
      if (!best.has(key)) best.set(key, attempt);
    }

    const students = course.enrollments.map((e) => {
      const scores: Record<
        string,
        { score: number; maxScore: number; submittedAt: string | null; late: boolean }
      > = {};

      for (const assignment of course.assignments) {
        const attempt = best.get(`${e.user.id}:${assignment.id}`);
        if (!attempt) continue;
        scores[assignment.id] = {
          score: attempt.score,
          maxScore: attempt.maxScore,
          submittedAt: attempt.submittedAt?.toISOString() ?? null,
          late:
            assignment.dueAt !== null &&
            attempt.submittedAt !== null &&
            attempt.submittedAt > assignment.dueAt,
        };
      }

      return { userId: e.user.id, name: e.user.name, email: e.user.email, scores };
    });

    const assignments = course.assignments.map((a) => ({
      id: a.id,
      lessonSlug: a.lesson.slug,
      lessonTitle: a.lesson.title,
      points: a.points,
      maxScore: a.lesson.maxScore,
      dueAt: a.dueAt?.toISOString() ?? null,
      maxAttempts: a.maxAttempts,
    }));

    const format = new URL(request.url).searchParams.get("format") ?? "json";

    if (format === "csv") {
      const header = [
        "Student Name",
        "Email",
        ...assignments.map((a) => a.lessonTitle),
        "Total",
        "Percent",
      ];

      const totalPossible = assignments.reduce((sum, a) => sum + a.maxScore, 0);

      const lines = [header.map(csvCell).join(",")];
      for (const student of students) {
        const cells = assignments.map((a) => {
          const score = student.scores[a.id];
          // A missing score renders as an empty cell, never as a zero: the two
          // mean different things to an instructor.
          return score ? String(score.score) : "";
        });
        const total = assignments.reduce((sum, a) => sum + (student.scores[a.id]?.score ?? 0), 0);
        const percent = totalPossible > 0 ? ((total / totalPossible) * 100).toFixed(1) : "";

        lines.push(
          [student.name, student.email, ...cells, String(total), percent].map(csvCell).join(","),
        );
      }

      const filename = `${slugifyCourse(course.name, course.term)}-gradebook.csv`;
      return new Response(`${lines.join("\n")}\n`, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    return ok({ students, assignments });
  },
);
