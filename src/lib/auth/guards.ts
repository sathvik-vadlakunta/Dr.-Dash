import type { Dashboard } from "@prisma/client";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http/respond";

/**
 * Section 11.3. Every route handler that touches user data calls one of these
 * as its first statement.
 *
 * Section 10.2: a resource the caller may not see returns 404, not 403, so the
 * response never confirms that it exists.
 */

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw HttpError.unauthorized();
  return session.user;
}

export async function requireInstructor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    throw HttpError.forbidden("INSTRUCTOR_REQUIRED", "Only instructors can do this.");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw HttpError.forbidden("ADMIN_REQUIRED", "Only administrators can do this.");
  }
  return user;
}

export async function requireCourseInstructor(courseId: string): Promise<SessionUser> {
  const user = await requireInstructor();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });
  if (!course) throw HttpError.notFound("That course does not exist.");
  if (course.instructorId !== user.id && user.role !== "ADMIN") {
    throw HttpError.notFound("That course does not exist.");
  }
  return user;
}

export async function requireOwnedDashboard(id: string): Promise<Dashboard> {
  const user = await requireUser();
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  // A private dashboard requested by a non-owner returns 404, not 403.
  if (!dashboard || dashboard.ownerId !== user.id) {
    throw HttpError.notFound("That dashboard does not exist.");
  }
  return dashboard;
}

/** Enrolled in the course, or teaching it. Used by the assignment and score reads. */
export async function requireCourseMember(courseId: string): Promise<SessionUser> {
  const user = await requireUser();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      instructorId: true,
      enrollments: { where: { userId: user.id, status: "ACTIVE" }, select: { id: true } },
    },
  });
  if (!course) throw HttpError.notFound("That course does not exist.");

  const isInstructor = course.instructorId === user.id || user.role === "ADMIN";
  if (!isInstructor && course.enrollments.length === 0) {
    throw HttpError.notFound("That course does not exist.");
  }
  return user;
}
