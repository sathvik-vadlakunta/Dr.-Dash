import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { makeSeriesLoader, prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { gradeAnswer, pointsFor } from "@/lib/lessons/grade";
import { isQuestion, lessonContentSchema } from "@/lib/lessons/schema";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  stepId: z.string().min(1),
  response: z.unknown(),
});

/**
 * Section 10.7. One answer, graded against live data. `correctResponse` is
 * released only once the student has it right or has run out of tries.
 */
export const POST = withRoute(
  "attempts.answer",
  async (request, { log }, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = bodySchema.parse(await readJson(request));

    const attempt = await prisma.lessonAttempt.findUnique({
      where: { id },
      include: { lesson: true },
    });
    if (!attempt || attempt.userId !== user.id) {
      throw HttpError.notFound("That attempt does not exist.");
    }
    if (attempt.status !== "IN_PROGRESS") {
      throw HttpError.conflict("ALREADY_SUBMITTED", "This attempt was already submitted.");
    }

    const content = lessonContentSchema.parse(attempt.lesson.contentJson);
    const step = content.steps.find((s) => s.id === body.stepId);
    if (!step || !isQuestion(step)) {
      throw HttpError.notFound("That question is not in this lesson.");
    }

    const existing = await prisma.attemptAnswer.findUnique({
      where: { attemptId_stepId: { attemptId: id, stepId: body.stepId } },
    });
    const previousTries = existing?.triesUsed ?? 0;

    if (existing?.isCorrect) {
      throw HttpError.conflict("ALREADY_ANSWERED", "You already answered this question.");
    }
    if (previousTries >= step.tries) {
      throw HttpError.conflict("NO_TRIES_LEFT", "You have used every try for this question.");
    }

    const graded = await gradeAnswer({
      step,
      response: body.response,
      ctx: { loader: makeSeriesLoader(user) },
      previousTries,
      onEvaluatorNull: (fn) => log.warn("lesson.evaluator_null", { fn, stepId: step.id }),
    });

    // An unreadable numeric answer does not consume a try (Section 19.4).
    if (!graded.consumedTry) {
      return ok({
        isCorrect: false,
        pointsEarned: existing?.pointsEarned ?? 0,
        pointsPossible: step.points,
        feedback: graded.feedback,
        explanation: null,
        triesRemaining: step.tries - previousTries,
      });
    }

    const triesUsed = previousTries + 1;
    const pointsEarned = graded.isCorrect ? pointsFor(step.points, triesUsed) : 0;
    const triesRemaining = graded.isCorrect ? 0 : Math.max(0, step.tries - triesUsed);

    await prisma.attemptAnswer.upsert({
      where: { attemptId_stepId: { attemptId: id, stepId: body.stepId } },
      create: {
        attemptId: id,
        stepId: body.stepId,
        responseJson: (body.response ?? null) as Prisma.InputJsonValue,
        isCorrect: graded.isCorrect,
        pointsEarned,
        pointsPossible: step.points,
        triesUsed,
        feedback: graded.feedback,
      },
      update: {
        responseJson: (body.response ?? null) as Prisma.InputJsonValue,
        isCorrect: graded.isCorrect,
        pointsEarned,
        triesUsed,
        feedback: graded.feedback,
      },
    });

    return ok({
      isCorrect: graded.isCorrect,
      pointsEarned,
      pointsPossible: step.points,
      feedback: graded.feedback,
      explanation: graded.explanation,
      ...(triesRemaining === 0 || graded.isCorrect
        ? { correctResponse: graded.correctResponse }
        : {}),
      triesRemaining,
    });
  },
);
