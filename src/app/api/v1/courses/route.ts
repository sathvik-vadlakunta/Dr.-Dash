import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireInstructor, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 5.1: 6 characters from A-Z2-9, with O, 0, I, and 1 left out because
 * a join code gets read aloud and typed from a slide.
 */
const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) code += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
    const taken = await prisma.course.findUnique({ where: { joinCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique join code.");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the course.").max(140),
  term: z.string().trim().min(1, "Name the term.").max(40),
});

export const POST = withRoute("courses.create", async (request) => {
  const user = await requireInstructor();
  const body = createSchema.parse(await readJson(request));

  const course = await prisma.course.create({
    data: {
      instructorId: user.id,
      name: body.name,
      term: body.term,
      joinCode: await uniqueJoinCode(),
    },
  });

  return ok(course, {}, 201);
});

export const GET = withRoute("courses.list", async () => {
  const user = await requireUser();

  const [taught, enrolled] = await Promise.all([
    prisma.course.findMany({
      where: { instructorId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { enrollments: true, assignments: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { joinedAt: "desc" },
      include: {
        course: {
          include: {
            instructor: { select: { name: true } },
            assignments: { include: { lesson: { select: { slug: true, title: true } } } },
          },
        },
      },
    }),
  ]);

  return ok({
    taught,
    enrolled: enrolled.map((e) => e.course),
  });
});
