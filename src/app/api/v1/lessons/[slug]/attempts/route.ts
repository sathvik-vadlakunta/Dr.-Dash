import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const bodySchema = z.object({ assignmentId: z.string().optional() });

/**
 * Section 10.7. Starting a lesson twice returns the attempt already in
 * progress rather than opening a second one, so a refreshed tab does not lose
 * a student's answers.
 */
export const POST = withRoute(
  "lessons.startAttempt",
  async (request, _context, { params }: { params: Promise<{ slug: string }> }) => {
    const user = await requireUser();
    const { slug } = await params;
    const body = bodySchema.parse(await readJson(request).catch(() => ({})));

    const lesson = await prisma.lesson.findUnique({ where: { slug } });
    if (!lesson || !lesson.published) throw HttpError.notFound("That lesson does not exist.");

    const assignmentId = body.assignmentId ?? null;

    const existing = await prisma.lessonAttempt.findFirst({
      where: { lessonId: lesson.id, userId: user.id, assignmentId, status: "IN_PROGRESS" },
    });
    if (existing) return ok(existing, {}, 200);

    if (assignmentId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        select: { maxAttempts: true, courseId: true },
      });
      if (!assignment) throw HttpError.notFound("That assignment does not exist.");

      const enrolled = await prisma.enrollment.findFirst({
        where: { courseId: assignment.courseId, userId: user.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (!enrolled) throw HttpError.notFound("That assignment does not exist.");

      const used = await prisma.lessonAttempt.count({
        where: { assignmentId, userId: user.id },
      });
      if (used >= assignment.maxAttempts) {
        throw HttpError.conflict(
          "MAX_ATTEMPTS_REACHED",
          `You have used all ${assignment.maxAttempts} attempts for this assignment.`,
        );
      }
    }

    const attempt = await prisma.lessonAttempt.create({
      data: {
        lessonId: lesson.id,
        userId: user.id,
        assignmentId,
        maxScore: lesson.maxScore,
        lessonVersion: lesson.version,
      },
    });

    return ok(attempt, {}, 201);
  },
);
