import { requireCourseInstructor } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(
  "courses.roster",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireCourseInstructor(id);

    const roster = await prisma.enrollment.findMany({
      where: { courseId: id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return ok(roster);
  },
);
