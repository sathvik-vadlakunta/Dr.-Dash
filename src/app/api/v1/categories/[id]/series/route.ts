import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { overlayFor, prisma, visibilityWhere } from "@/lib/db";
import { HttpError, noContent, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

const bodySchema = z.object({
  seriesId: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export const POST = withRoute(
  "categories.addSeries",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = bodySchema.parse(await readJson(request));

    const series = await prisma.series.findFirst({
      where: { id: body.seriesId, AND: [visibilityWhere(user)] },
      select: { id: true },
    });
    if (!series) throw HttpError.notFound("That series does not exist.");

    const categoryId = await overlayFor(id, user);
    const link = await prisma.categorySeries.upsert({
      where: { categoryId_seriesId: { categoryId, seriesId: series.id } },
      create: { categoryId, seriesId: series.id, sortOrder: body.sortOrder ?? 0 },
      update: { sortOrder: body.sortOrder ?? 0 },
    });

    return ok(link, {}, 201);
  },
);

/**
 * Section 9.1 rule 5. Removing a series from a category never deletes the
 * series; it deletes the link, and only inside the caller's own overlay.
 */
export const DELETE = withRoute(
  "categories.removeSeries",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const seriesId = new URL(request.url).searchParams.get("seriesId");
    if (!seriesId) {
      throw HttpError.unprocessable("SERIES_ID_REQUIRED", "Name the series to remove.");
    }

    const categoryId = await overlayFor(id, user);
    await prisma.categorySeries.deleteMany({ where: { categoryId, seriesId } });

    return noContent();
  },
);
