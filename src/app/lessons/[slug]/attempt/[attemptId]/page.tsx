import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LessonRunner } from "@/components/lesson/LessonRunner";
import { ToastProvider } from "@/components/ui/Toast";
import { prisma, resolveCategoryTree } from "@/lib/db";
import { lessonContentSchema, toClientLesson } from "@/lib/lessons/schema";
import type { ClientLesson, ClientStep } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 21.1.8: a running attempt is named for the lesson it runs. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { slug }, select: { title: true } });
  return { title: lesson ? `${lesson.title}, in progress` : "Not found" };
}

/**
 * Section 19.8. `attemptId` of `new` opens one, so "Start lesson" is a single
 * link and a refresh of the runner cannot create a second attempt.
 */
export default async function LessonAttemptPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/lessons/${slug}`);

  const lesson = await prisma.lesson.findUnique({ where: { slug } });
  if (!lesson || !lesson.published) notFound();

  let attempt =
    attemptId === "new"
      ? await prisma.lessonAttempt.findFirst({
          where: { lessonId: lesson.id, userId: session.user.id, status: "IN_PROGRESS" },
        })
      : await prisma.lessonAttempt.findUnique({ where: { id: attemptId } });

  if (attemptId === "new" && !attempt) {
    attempt = await prisma.lessonAttempt.create({
      data: {
        lessonId: lesson.id,
        userId: session.user.id,
        maxScore: lesson.maxScore,
        lessonVersion: lesson.version,
      },
    });
  }

  if (!attempt || attempt.userId !== session.user.id) notFound();
  if (attemptId === "new") redirect(`/lessons/${slug}/attempt/${attempt.id}`);

  const content = lessonContentSchema.parse(lesson.contentJson);
  const client = toClientLesson(content);

  // The state check's checklist names series by their label, not their slug.
  const labelRows = await prisma.series.findMany({
    where: { slug: { in: content.sources } },
    select: { slug: true, shortLabel: true },
  });
  const labels = Object.fromEntries(labelRows.map((r) => [r.slug, r.shortLabel]));

  const categories = await resolveCategoryTree(session.user);

  const assignment = attempt.assignmentId
    ? await prisma.assignment.findUnique({
        where: { id: attempt.assignmentId },
        select: { courseId: true, course: { select: { name: true } } },
      })
    : null;

  const clientLesson: ClientLesson = {
    slug: lesson.slug,
    title: lesson.title,
    summary: lesson.summary,
    level: lesson.level,
    estimatedMinutes: lesson.estimatedMinutes,
    version: lesson.version,
    maxScore: lesson.maxScore,
    content: { ...client, steps: client.steps as ClientStep[] },
  };

  return (
    <ToastProvider>
      <LessonRunner
        lesson={clientLesson}
        attempt={{
          id: attempt.id,
          lessonId: attempt.lessonId,
          status: attempt.status,
          score: attempt.score,
          maxScore: attempt.maxScore,
          currentStep: attempt.currentStep,
        }}
        categories={categories}
        labels={labels}
        courseId={assignment?.courseId ?? null}
        courseName={assignment?.course.name ?? null}
      />
    </ToastProvider>
  );
}
