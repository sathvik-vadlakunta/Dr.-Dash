import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import { isQuestion, lessonContentSchema, maxScoreOf } from "@/lib/lessons/schema";

export const runtime = "nodejs";

/** Section 10.7. Submitting twice is a conflict, not a second score. */
export const POST = withRoute(
  "attempts.submit",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const attempt = await prisma.lessonAttempt.findUnique({
      where: { id },
      include: { lesson: true, answers: true },
    });
    if (!attempt || attempt.userId !== user.id) {
      throw HttpError.notFound("That attempt does not exist.");
    }
    if (attempt.status === "SUBMITTED") {
      throw HttpError.conflict("ALREADY_SUBMITTED", "This attempt was already submitted.");
    }

    const content = lessonContentSchema.parse(attempt.lesson.contentJson);
    const questions = content.steps.filter(isQuestion);
    const answers = new Map(attempt.answers.map((a) => [a.stepId, a]));

    const score = attempt.answers.reduce((sum, a) => sum + a.pointsEarned, 0);
    const maxScore = maxScoreOf(content);

    const updated = await prisma.lessonAttempt.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        score: Math.round(score * 100) / 100,
        maxScore,
      },
    });

    return ok({
      score: updated.score,
      maxScore,
      perStep: questions.map((q) => {
        const answer = answers.get(q.id);
        return {
          stepId: q.id,
          prompt: q.prompt,
          response: answer?.responseJson ?? null,
          isCorrect: answer?.isCorrect ?? false,
          pointsEarned: answer?.pointsEarned ?? 0,
          pointsPossible: q.points,
          triesUsed: answer?.triesUsed ?? 0,
          // The explanation is teaching material, released once the attempt is
          // over whether or not the student got it right.
          explanation: q.explanation,
        };
      }),
    });
  },
);
