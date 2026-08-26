import { beforeAll, describe, expect, it } from "vitest";
import { makeSeriesLoader } from "@/lib/db";
import { evaluate } from "@/lib/lessons/evaluate";
import { isQuestion, lessonContentSchema, maxScoreOf } from "@/lib/lessons/schema";
import { HTTP_BASE_URL } from "./globalSetup";

/**
 * Phase 7's acceptance: "Every lesson can be completed start to finish against
 * seeded data" and "a deliberately wrong evaluator argument fails at seed time,
 * not at grade time".
 *
 * Every computed answer key in every lesson is run against the real seeded
 * observations. A key that throws, or that names a series the lesson never
 * plots, is a lesson a student cannot finish.
 */

interface LessonRow {
  slug: string;
  title: string;
  maxScore: number;
  contentJson: unknown;
}

describe("every seeded lesson", () => {
  let lessons: LessonRow[] = [];

  beforeAll(async () => {
    // globalSetup already migrated and seeded the schema the server is using,
    // and these checks only read, so they run against it rather than re-seeding.
    const res = await fetch(`${HTTP_BASE_URL}/api/v1/lessons`);
    expect(res.ok).toBe(true);
    const listed = ((await res.json()) as { data: Array<{ slug: string }> }).data;
    expect(listed.length).toBe(6);
  });

  it("lists six published lessons", async () => {
    const res = await fetch(`${HTTP_BASE_URL}/api/v1/lessons`);
    const body = (await res.json()) as { data: Array<{ slug: string; maxScore: number }> };

    expect(body.data.map((l) => l.slug).sort()).toEqual([
      "inflation-from-an-index",
      "levels-vs-growth",
      "nominal-vs-real",
      "per-capita-living-standards",
      "reading-the-labor-market",
      "shares-of-gdp",
    ]);
    for (const lesson of body.data) expect(lesson.maxScore).toBeGreaterThan(0);
  });

  it("has content that satisfies the schema, with maxScore equal to its points", async () => {
    lessons = (await prismaLessons()) as LessonRow[];
    expect(lessons.length).toBe(6);

    for (const lesson of lessons) {
      const content = lessonContentSchema.parse(lesson.contentJson);
      expect(maxScoreOf(content)).toBe(lesson.maxScore);

      // Every series a question reads has to be one the lesson declares.
      const declared = new Set(content.sources);
      for (const step of content.steps) {
        if (step.type === "TASK") {
          for (const target of step.target.series) {
            expect(declared.has(target.slug), `${lesson.slug} plots undeclared ${target.slug}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it("can answer every computed key against the seeded data", async () => {
    const loader = makeSeriesLoader(null);
    const unanswerable: string[] = [];

    for (const lesson of lessons) {
      const content = lessonContentSchema.parse(lesson.contentJson);

      for (const step of content.steps) {
        if (!isQuestion(step) || step.type !== "QUESTION_NUMERIC") continue;
        if (step.answer.kind !== "computed") continue;

        // A throw is a broken lesson. A null is a period not published yet,
        // which the grader credits rather than failing (Section 19.4).
        const value = await evaluate(step.answer.fn, step.answer.args, { loader }).catch(
          (error: unknown) => {
            unanswerable.push(`${lesson.slug}/${step.id}: ${(error as Error).message}`);
            return undefined;
          },
        );

        if (value !== undefined && value !== null) {
          expect(
            typeof value === "number" ? Number.isFinite(value) : value.length > 0,
            `${lesson.slug}/${step.id} produced ${String(value)}`,
          ).toBe(true);
        }
      }
    }

    expect(unanswerable).toEqual([]);
  });

  it("locks every question behind a task", async () => {
    for (const lesson of lessons) {
      const content = lessonContentSchema.parse(lesson.contentJson);

      content.steps.forEach((step, index) => {
        if (!isQuestion(step)) return;
        const hasTaskBefore = content.steps.slice(0, index).some((s) => s.type === "TASK");
        expect(hasTaskBefore, `${lesson.slug}/${step.id} has no task before it`).toBe(true);
      });
    }
  });
});

/** Read the lessons straight out of the schema the server is using. */
async function prismaLessons(): Promise<unknown[]> {
  const { PrismaClient } = await import("@prisma/client");
  const { config } = await import("@/lib/config");
  const url = new URL(config.DATABASE_URL);
  url.searchParams.set("schema", "it_http");

  const client = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    return await client.lesson.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, title: true, maxScore: true, contentJson: true },
    });
  } finally {
    await client.$disconnect();
  }
}
