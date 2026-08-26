import { z } from "zod";
import { requireCourseInstructor } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const bodySchema = z.object({
  lessonId: z.string().min(1, "Choose a lesson."),
  dueAt: z.string().datetime().nullable().optional(),
  points: z.number().positive().optional(),
  allowLateUntil: z.string().datetime().nullable().optional(),
  maxAttempts: z.number().int().positive().max(20).optional(),
});

export const POST = withRoute(
  "courses.assign",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireCourseInstructor(id);
    const body = bodySchema.parse(await readJson(request));

    const lesson = await prisma.lesson.findUnique({
      where: { id: body.lessonId },
      select: { id: true },
    });
    if (!lesson) throw HttpError.notFound("That lesson does not exist.");

    const existing = await prisma.assignment.findUnique({
      where: { courseId_lessonId: { courseId: id, lessonId: body.lessonId } },
      select: { id: true },
    });
    if (existing) {
      throw HttpError.conflict("ALREADY_ASSIGNED", "That lesson is already assigned here.");
    }

    const assignment = await prisma.assignment.create({
      data: {
        courseId: id,
        lessonId: body.lessonId,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        allowLateUntil: body.allowLateUntil ? new Date(body.allowLateUntil) : null,
        ...(body.points !== undefined ? { points: body.points } : {}),
        ...(body.maxAttempts !== undefined ? { maxAttempts: body.maxAttempts } : {}),
      },
    });

    return ok(assignment, {}, 201);
  },
);
