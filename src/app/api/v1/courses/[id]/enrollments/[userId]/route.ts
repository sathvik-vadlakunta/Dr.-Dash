import { requireCourseInstructor } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { noContent, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

/**
 * Section 10.8. Dropping a student sets the status rather than deleting the
 * row, so their attempts and scores survive the drop.
 */
export const DELETE = withRoute(
  "courses.drop",
  async (
    _request,
    _context,
    { params }: { params: Promise<{ id: string; userId: string }> },
  ) => {
    const { id, userId } = await params;
    await requireCourseInstructor(id);

    await prisma.enrollment.updateMany({
      where: { courseId: id, userId },
      data: { status: "DROPPED" },
    });

    return noContent();
  },
);
