import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import type { ParsedColumn } from "@/lib/csv/parseImport";
import { prisma } from "@/lib/db";
import { upsertObservations } from "@/lib/fred/sync";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { checkSeriesInvariants, type SeriesFields } from "@/lib/series/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  shortLabel: z.string().trim().min(1).max(28),
  title: z.string().trim().min(1).max(200),
  units: z.string().trim().min(1).max(80),
  unitsShort: z.string().trim().min(1).max(40),
  unitMultiplier: z.union([
    z.literal(1),
    z.literal(1e3),
    z.literal(1e6),
    z.literal(1e9),
    z.literal(1e12),
  ]),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
  kind: z.enum(["LEVEL_CURRENCY", "LEVEL_COUNT", "INDEX", "RATE_PERCENT", "RATIO", "FLAG"]),
  isNominal: z.boolean().default(false),
  /** A nominal user series must name the deflator it will be adjusted with. */
  deflatorSlug: z.string().nullable().default(null),
  populationSlug: z.string().nullable().default(null),
  aggregation: z.enum(["AVG", "SUM", "EOP"]).default("AVG"),
  categoryId: z.string().min(1, "Choose a category."),
  column: z.string().optional(),
  /** Section 9.4: an instructor may commit into their organization instead. */
  scope: z.enum(["user", "org"]).default("user"),
});

/** `usr_` plus 10 random lowercase alphanumerics (Section 9.3). */
function userSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(10);
  let out = "usr_";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const POST = withRoute(
  "imports.commit",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = bodySchema.parse(await readJson(request));

    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job || job.userId !== user.id) throw HttpError.notFound("That import does not exist.");
    if (job.status === "COMMITTED") {
      throw HttpError.conflict("ALREADY_COMMITTED", "That import was already committed.");
    }

    const columns = job.payloadJson as unknown as ParsedColumn[];
    const column = body.column
      ? columns.find((c) => c.header === body.column)
      : columns[0];
    if (!column) throw HttpError.unprocessable("UNKNOWN_COLUMN", "That column is not in the file.");

    if (body.scope === "org") {
      if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
        throw HttpError.forbidden("INSTRUCTOR_REQUIRED", "Only instructors can add org series.");
      }
      if (!user.orgId) {
        throw HttpError.unprocessable("NO_ORGANIZATION", "Your account is not in an organization.");
      }
    }

    if (body.isNominal && !body.deflatorSlug) {
      throw HttpError.unprocessable(
        "DEFLATOR_REQUIRED",
        "A series in current dollars needs a deflator before it can be adjusted for inflation.",
      );
    }

    const fields: SeriesFields = {
      slug: userSlug(),
      source: body.scope === "org" ? "ORG" : "USER",
      fredId: null,
      title: body.title,
      shortLabel: body.shortLabel,
      description: `Imported from ${job.filename}.`,
      units: body.units,
      unitsShort: body.unitsShort,
      unitMultiplier: body.unitMultiplier,
      frequency: body.frequency,
      seasonalAdjustment: "NSA",
      kind: body.kind,
      isNominal: body.isNominal,
      isRealAlready: false,
      canReal: body.isNominal,
      canPerCapita:
        (body.kind === "LEVEL_CURRENCY" || body.kind === "LEVEL_COUNT") &&
        body.populationSlug !== null,
      canGrowth: body.kind !== "FLAG",
      canBeDenominator: body.kind !== "RATE_PERCENT" && body.kind !== "FLAG",
      defaultDeflator: body.deflatorSlug,
      defaultPopulation: body.populationSlug,
      aggregation: body.aggregation,
      sourceName: "User import",
      sourceUrl: null,
      notes: null,
      // An imported series is private to the importer or the org.
      isPublic: false,
    };

    const violations = checkSeriesInvariants(fields);
    if (violations.length > 0) {
      throw HttpError.unprocessable(
        "INVARIANT_VIOLATION",
        "Those settings contradict the catalog rules.",
        violations.map((v) => ({ rule: v.rule, message: v.message })),
      );
    }

    const usable = column.points.filter((p) => p.value !== null);
    const series = await prisma.series.create({
      data: {
        ...fields,
        ownerId: body.scope === "org" ? null : user.id,
        orgId: body.scope === "org" ? user.orgId : null,
        observationStart: usable[0] ? new Date(`${usable[0].date}T00:00:00Z`) : null,
        observationEnd: usable.at(-1) ? new Date(`${usable.at(-1)?.date}T00:00:00Z`) : null,
        lastSyncedAt: new Date(),
      },
    });

    await upsertObservations(prisma, series.id, column.points);
    await prisma.categorySeries.create({
      data: { categoryId: body.categoryId, seriesId: series.id },
    });
    await prisma.importJob.update({ where: { id }, data: { status: "COMMITTED" } });

    return ok({ series, observations: column.points.length }, {}, 201);
  },
);
