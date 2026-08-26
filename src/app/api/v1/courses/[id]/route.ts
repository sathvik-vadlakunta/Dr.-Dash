import { requireCourseMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(
  "courses.get",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireCourseMember(id);

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        instructor: { select: { id: true, name: true } },
        assignments: {
          include: { lesson: { select: { slug: true, title: true, maxScore: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw HttpError.notFound("That course does not exist.");

    // A student sees their own scores and nobody else's.
    const isInstructor = course.instructorId === user.id || user.role === "ADMIN";
    const myAttempts = isInstructor
      ? []
      : await prisma.lessonAttempt.findMany({
          where: { userId: user.id, assignmentId: { in: course.assignments.map((a) => a.id) } },
          select: { assignmentId: true, score: true, maxScore: true, submittedAt: true },
        });

    return ok({ ...course, myAttempts, joinCode: isInstructor ? course.joinCode : null });
  },
);
