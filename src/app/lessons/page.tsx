import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Lessons" };

/**
 * Section 16.5. One card per lesson with its best score, and Start or Continue
 * depending on whether an attempt is already open.
 */
export default async function LessonsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/lessons");

  const lessons = await prisma.lesson.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  const attempts = await prisma.lessonAttempt.findMany({
    where: { userId: session.user.id },
    select: { lessonId: true, status: true, score: true, id: true },
  });

  return (
    <main className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="font-display text-display-m">Lessons</h1>
        <p className="mt-2 text-body text-ink-muted">
          Each one alternates a task in Dr. Dash with a question about what you just saw. The
          grades exist mainly to make sure the tasks actually get done.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {lessons.map((lesson) => {
          const mine = attempts.filter((a) => a.lessonId === lesson.id);
          const open = mine.find((a) => a.status === "IN_PROGRESS");
          const best = mine.reduce<number | null>(
            (max, a) => (max === null || a.score > max ? a.score : max),
            null,
          );

          return (
            <li key={lesson.id} className="rounded-card border border-rule p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-title">{lesson.title}</h2>
                <span className="font-mono text-data text-ink-muted">
                  {lesson.level.toLowerCase()} · {lesson.estimatedMinutes} min ·{" "}
                  {lesson.maxScore} points
                </span>
              </div>

              <p className="mt-2 text-body text-ink">{lesson.summary}</p>

              <div className="mt-3 flex items-center gap-4">
                <Link
                  href={`/lessons/${lesson.slug}`}
                  className="inline-flex h-[36px] items-center rounded-control bg-accent px-4 text-small font-medium text-accent-ink"
                >
                  {open ? "Continue" : "Start"}
                </Link>
                {best !== null ? (
                  <span className="font-mono text-data text-ink-muted">
                    Best {best} of {lesson.maxScore}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
