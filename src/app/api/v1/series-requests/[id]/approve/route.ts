import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getSeriesMeta } from "@/lib/fred/client";
import { mapFredSeries } from "@/lib/fred/map";
import { syncSeries } from "@/lib/fred/sync";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { checkSeriesInvariants, type SeriesFields } from "@/lib/series/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Section 9.5 step 3 and Section 9.6. Nothing is auto-created: the admin screen
 * shows every mapped field in editable inputs and sends back any corrections as
 * `overrides` before this writes the row.
 */
const bodySchema = z.object({
  categoryId: z.string().min(1, "Choose a category."),
  overrides: z.record(z.unknown()).optional(),
  reject: z.boolean().optional(),
  rejectionReason: z.string().trim().min(1).max(500).optional(),
});

export const POST = withRoute(
  "seriesRequests.approve",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = bodySchema.parse(await readJson(request));

    const requestRow = await prisma.seriesRequest.findUnique({ where: { id } });
    if (!requestRow) throw HttpError.notFound("That request does not exist.");
    if (requestRow.status !== "PENDING") {
      throw HttpError.conflict("ALREADY_DECIDED", "That request has already been decided.");
    }

    if (body.reject) {
      if (!body.rejectionReason) {
        throw HttpError.unprocessable(
          "REJECTION_REASON_REQUIRED",
          "Say why, so the requester knows what to do next.",
        );
      }
      const rejected = await prisma.seriesRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: body.rejectionReason,
          decidedAt: new Date(),
          decidedBy: admin.id,
        },
      });
      return ok(rejected);
    }

    const meta = await getSeriesMeta(requestRow.fredId);
    const mapped = mapFredSeries(meta);

    const fields = {
      slug: mapped.slug,
      source: "FRED" as const,
      fredId: mapped.fredId,
      title: mapped.title,
      shortLabel: mapped.shortLabel,
      description: mapped.description,
      units: mapped.units,
      unitsShort: mapped.unitsShort,
      unitMultiplier: mapped.unitMultiplier,
      frequency: mapped.frequency,
      seasonalAdjustment: mapped.seasonalAdjustment,
      kind: mapped.kind,
      isNominal: mapped.isNominal,
      isRealAlready: mapped.isRealAlready,
      canReal: mapped.canReal,
      canPerCapita: mapped.canPerCapita,
      canGrowth: mapped.canGrowth,
      canBeDenominator: mapped.canBeDenominator,
      defaultDeflator: mapped.isNominal ? "CPIAUCSL" : null,
      defaultPopulation: null,
      aggregation: "AVG" as const,
      sourceName: mapped.sourceName,
      sourceUrl: mapped.sourceUrl,
      notes: null,
      isPublic: true,
      ...(body.overrides ?? {}),
    } as SeriesFields;

    // Section 5.2 applies to an approved series exactly as it does to a seeded
    // one, so a bad override is rejected here rather than corrupting the catalog.
    const violations = checkSeriesInvariants(fields);
    if (violations.length > 0) {
      throw HttpError.unprocessable(
        "INVARIANT_VIOLATION",
        "Those settings contradict the catalog rules.",
        violations.map((v) => ({ rule: v.rule, message: v.message })),
      );
    }

    const series = await prisma.series.create({
      data: { ...fields, fredLastUpdated: new Date(mapped.fredLastUpdated) },
    });
    await prisma.categorySeries.create({
      data: { categoryId: body.categoryId, seriesId: series.id },
    });

    await prisma.seriesRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: new Date(), decidedBy: admin.id },
    });

    // A newly approved series has no history yet, so pull all of it.
    const synced = await syncSeries(series.slug, { full: true });

    return ok({ series, sync: synced }, {}, 201);
  },
);
