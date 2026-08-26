import { prisma } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import { lessonContentSchema, toClientLesson } from "@/lib/lessons/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.7. The answer keys never leave the server: `toClientLesson`
 * strips `answer`, `tolerance`, `rubric`, and `explanation` before the payload
 * is built, so no route can forget to.
 */
export const GET = withRoute(
  "lessons.get",
  async (_request, _context, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;

    const lesson = await prisma.lesson.findUnique({ where: { slug } });
    if (!lesson || !lesson.published) throw HttpError.notFound("That lesson does not exist.");

    const content = lessonContentSchema.parse(lesson.contentJson);

    return ok({
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      level: lesson.level,
      estimatedMinutes: lesson.estimatedMinutes,
      version: lesson.version,
      maxScore: lesson.maxScore,
      content: toClientLesson(content),
    });
  },
);
