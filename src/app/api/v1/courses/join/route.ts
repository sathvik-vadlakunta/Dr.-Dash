import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const bodySchema = z.object({
  joinCode: z.string().trim().min(1, "Enter the join code.").max(12),
});

export const POST = withRoute("courses.join", async (request) => {
  const user = await requireUser();
  const body = bodySchema.parse(await readJson(request));

  // Codes are read off a slide, so treat them case-insensitively.
  const course = await prisma.course.findUnique({
    where: { joinCode: body.joinCode.toUpperCase() },
  });
  if (!course || course.archived) {
    throw HttpError.notFound("That join code does not match a course.");
  }
  if (course.instructorId === user.id) {
    throw HttpError.conflict("ALREADY_ENROLLED", "You teach this course.");
  }

  const existing = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
  });
  if (existing && existing.status === "ACTIVE") {
    throw HttpError.conflict("ALREADY_ENROLLED", "You are already in this course.");
  }

  await prisma.enrollment.upsert({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    create: { courseId: course.id, userId: user.id },
    update: { status: "ACTIVE" },
  });

  return ok(course, {}, 201);
});
