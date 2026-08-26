import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const patchSchema = z.object({ currentStep: z.number().int().min(0).max(500) });

/**
 * Section 19.8's autosave: "the attempt's `currentStep` is PATCHed on every step
 * advance so a student can close the tab and return". Section 10.7 does not list
 * the route, but the behaviour it describes needs one.
 */
export const PATCH = withRoute(
  "attempts.patch",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = patchSchema.parse(await readJson(request));

    const attempt = await prisma.lessonAttempt.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    if (!attempt || attempt.userId !== user.id) {
      throw HttpError.notFound("That attempt does not exist.");
    }
    if (attempt.status !== "IN_PROGRESS") {
      throw HttpError.conflict("ALREADY_SUBMITTED", "This attempt was already submitted.");
    }

    const updated = await prisma.lessonAttempt.update({
      where: { id },
      data: { currentStep: body.currentStep },
      select: { id: true, currentStep: true },
    });

    return ok(updated);
  },
);
