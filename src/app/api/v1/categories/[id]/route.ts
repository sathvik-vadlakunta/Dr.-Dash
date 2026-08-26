import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import {
  MAX_CATEGORY_DEPTH,
  categoryDepth,
  overlayFor,
  prisma,
} from "@/lib/db";
import { HttpError, noContent, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * Section 10.4. Patching a system category transparently creates the caller's
 * overlay and applies the change there, returning the overlay's id so the
 * client can keep editing the thing it now owns.
 */
export const PATCH = withRoute(
  "categories.patch",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = patchSchema.parse(await readJson(request));

    const target = await prisma.category.findUnique({
      where: { id },
      select: { id: true, ownerId: true, orgId: true },
    });
    if (!target) throw HttpError.notFound("That category does not exist.");
    if (target.ownerId !== null && target.ownerId !== user.id) {
      throw HttpError.notFound("That category does not exist.");
    }
    if (target.orgId !== null && target.orgId !== user.orgId) {
      throw HttpError.notFound("That category does not exist.");
    }

    if (body.parentId) {
      if (body.parentId === id) {
        throw HttpError.unprocessable("CATEGORY_CYCLE", "A category cannot contain itself.");
      }
      const depth = await categoryDepth(body.parentId);
      if (depth >= MAX_CATEGORY_DEPTH) {
        throw HttpError.unprocessable(
          "CATEGORY_TOO_DEEP",
          `Categories nest at most ${MAX_CATEGORY_DEPTH} levels deep.`,
        );
      }
    }

    const editableId = await overlayFor(id, user);
    const updated = await prisma.category.update({
      where: { id: editableId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });

    return ok(updated);
  },
);

export const DELETE = withRoute(
  "categories.delete",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const target = await prisma.category.findUnique({
      where: { id },
      select: { id: true, ownerId: true, parentId: true },
    });
    if (!target) throw HttpError.notFound("That category does not exist.");

    // A system category belongs to everyone, so no single user may delete it.
    if (target.ownerId === null) {
      throw HttpError.forbidden("SYSTEM_CATEGORY", "A built-in category cannot be deleted.");
    }
    if (target.ownerId !== user.id) throw HttpError.notFound("That category does not exist.");

    // Children are re-parented to the deleted node's parent rather than being
    // deleted with it; the cascade in the schema would take them too.
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: target.parentId },
    });
    await prisma.category.delete({ where: { id } });

    return noContent();
  },
);
