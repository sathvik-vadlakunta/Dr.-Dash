import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { lessonContentSchema } from "@/lib/lessons/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 21.1.8: every page title names the page, not the product. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { slug },
    select: { title: true, summary: true },
  });
  return lesson ? { title: lesson.title, description: lesson.summary } : { title: "Not found" };
}

/**
 * Section 16.5. The overview: what the lesson is for, what it uses, and a
 * single button that opens an attempt and drops the student into the product.
 */
export default async function LessonOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/lessons/${slug}`);

  const lesson = await prisma.lesson.findUnique({ where: { slug } });
  if (!lesson || !lesson.published) notFound();

  const content = lessonContentSchema.parse(lesson.contentJson);

  const open = await prisma.lessonAttempt.findFirst({
    where: { lessonId: lesson.id, userId: session.user.id, status: "IN_PROGRESS" },
    select: { id: true },
  });

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="font-display text-display-m">{lesson.title}</h1>
        <p className="mt-2 font-mono text-data text-ink-muted">
          {lesson.level.toLowerCase()} · {lesson.estimatedMinutes} minutes · {lesson.maxScore}{" "}
          points
        </p>
      </div>

      <p className="text-body text-ink">{lesson.summary}</p>

      <section>
        <h2 className="eyebrow">What you will be able to do</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
          {content.objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="eyebrow">Data used</h2>
        <p className="mt-2 font-mono text-data text-ink-muted">{content.sources.join(", ")}</p>
      </section>

      <StartButton slug={slug} openAttemptId={open?.id ?? null} />

      <Link href="/lessons" className="text-small text-accent underline">
        Back to lessons
      </Link>
    </main>
  );
}

/**
 * `attempt/new` resolves to the attempt already in progress when there is one,
 * so a refresh can never open a second.
 */
function StartButton({ slug, openAttemptId }: { slug: string; openAttemptId: string | null }) {
  if (openAttemptId) {
    return (
      <Link
        href={`/lessons/${slug}/attempt/${openAttemptId}`}
        className="inline-flex h-[36px] items-center rounded-control bg-accent px-4 text-small font-medium text-accent-ink"
      >
        Continue lesson
      </Link>
    );
  }
  return (
    <Link
      href={`/lessons/${slug}/attempt/new`}
      className="inline-flex h-[36px] items-center rounded-control bg-accent px-4 text-small font-medium text-accent-ink"
    >
      Start lesson
    </Link>
  );
}
