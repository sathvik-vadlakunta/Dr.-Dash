import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 10.7. Published lessons, with the caller's own best score. */
export const GET = withRoute("lessons.list", async () => {
  const session = await getSession();

  const lessons = await prisma.lesson.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      // The assignment route addresses a lesson by id.
      id: true,
      slug: true,
      title: true,
      summary: true,
      estimatedMinutes: true,
      level: true,
      maxScore: true,
    },
  });

  if (!session) {
    return ok(lessons.map((l) => ({ ...l, myBestScore: null, myAttemptCount: 0 })));
  }

  const attempts = await prisma.lessonAttempt.groupBy({
    by: ["lessonId"],
    where: { userId: session.user.id },
    _max: { score: true },
    _count: { id: true },
  });
  const lessonIds = await prisma.lesson.findMany({ select: { id: true, slug: true } });
  const slugById = new Map(lessonIds.map((l) => [l.id, l.slug]));
  const byslug = new Map(
    attempts.map((a) => [slugById.get(a.lessonId) ?? "", a]),
  );

  return ok(
    lessons.map((l) => {
      const mine = byslug.get(l.slug);
      return {
        ...l,
        myBestScore: mine?._max.score ?? null,
        myAttemptCount: mine?._count.id ?? 0,
      };
    }),
  );
});
