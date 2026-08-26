import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma, SERIES_FIELDS, toSeriesData, visibilityWhere } from "@/lib/db";
import { searchSeries } from "@/lib/fred/client";
import { config } from "@/lib/config";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import { capabilitiesFor } from "@/lib/series/capabilities";
import { emptyTransform } from "@/lib/series/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.4, `GET /api/v1/series`.
 */

const querySchema = z.object({
  q: z.string().trim().min(2, "Search needs at least two characters.").optional(),
  categoryId: z.string().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]).optional(),
  role: z.enum(["deflator", "population", "denominator"]).optional(),
  source: z.enum(["fred", "constructed", "user", "org", "fred-remote"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

function toItem(row: Prisma.SeriesGetPayload<{ select: typeof SERIES_FIELDS }>) {
  const caps = capabilitiesFor(toSeriesData(row, []), emptyTransform());
  return {
    slug: row.slug,
    shortLabel: row.shortLabel,
    title: row.title,
    units: row.units,
    unitsShort: row.unitsShort,
    frequency: row.frequency,
    kind: row.kind,
    source: row.source,
    observationStart: row.observationStart?.toISOString().slice(0, 10) ?? null,
    observationEnd: row.observationEnd?.toISOString().slice(0, 10) ?? null,
    capabilities: {
      real: caps.real.enabled,
      perCapita: caps.perCapita.enabled,
      growth: caps.growth.enabled,
      denominator: caps.denominator.enabled,
    },
    inDatabase: true,
  };
}

/** `source=fred-remote` proxies FRED's own search for the request flow (Section 9.5). */
async function remoteSearch(text: string, limit: number) {
  if (!config.hasFredKey) {
    throw HttpError.unavailable("FRED_KEY_MISSING", "Set FRED_API_KEY to sync live data.");
  }
  const candidates = await searchSeries(text, Math.min(limit, 10));
  const known = await prisma.series.findMany({
    where: { fredId: { in: candidates.map((c) => c.id) } },
    select: { fredId: true },
  });
  const inDatabase = new Set(known.map((k) => k.fredId));

  return candidates.map((c) => ({
    id: c.id,
    title: c.title,
    frequency: c.frequency,
    units: c.units,
    observation_start: c.observation_start,
    observation_end: c.observation_end,
    popularity: c.popularity ?? 0,
    inDatabase: inDatabase.has(c.id),
  }));
}

export const GET = withRoute("series.list", async (request) => {
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));

  if (query.source === "fred-remote") {
    if (!query.q) {
      throw HttpError.unprocessable("SEARCH_TEXT_REQUIRED", "Type at least two characters.");
    }
    return ok(await remoteSearch(query.q, query.limit));
  }

  const session = await getSession();
  const where: Prisma.SeriesWhereInput = {
    AND: [
      visibilityWhere(session?.user ?? null),
      // Section 7.2: the recession flag never appears in the catalog.
      { NOT: { slug: "USREC" } },
      ...(query.frequency ? [{ frequency: query.frequency }] : []),
      ...(query.categoryId ? [{ categoryLinks: { some: { categoryId: query.categoryId } } }] : []),
      ...(query.source
        ? [{ source: query.source.toUpperCase() as Prisma.EnumSeriesSourceFilter["equals"] }]
        : []),
      ...(query.role === "deflator" ? [{ notes: { startsWith: "DEFLATOR:" } }] : []),
      ...(query.role === "population" ? [{ notes: { startsWith: "POPULATION:" } }] : []),
      ...(query.role === "denominator" ? [{ canBeDenominator: true }] : []),
      ...(query.q
        ? [
            {
              OR: [
                { slug: { contains: query.q, mode: "insensitive" as const } },
                { shortLabel: { contains: query.q, mode: "insensitive" as const } },
                { title: { contains: query.q, mode: "insensitive" as const } },
                { description: { contains: query.q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const rows = await prisma.series.findMany({
    where,
    select: SERIES_FIELDS,
    // Section 9.2's ranking is applied below; popularity is the tiebreak the
    // database can do.
    orderBy: [{ popularity: "desc" }, { slug: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, query.limit);
  const nextCursor = rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null;

  // Section 9.2 ranking: exact slug first, then a shortLabel prefix, then the
  // database's popularity order.
  const q = query.q?.toLowerCase();
  const ranked = q
    ? [...page].sort((a, b) => rank(a, q) - rank(b, q))
    : page;

  return ok(ranked.map(toItem), { nextCursor });
});

function rank(
  row: Prisma.SeriesGetPayload<{ select: typeof SERIES_FIELDS }>,
  q: string,
): number {
  if (row.slug.toLowerCase() === q) return 0;
  if (row.shortLabel.toLowerCase().startsWith(q)) return 1;
  if (row.title.toLowerCase().includes(q)) return 2;
  return 3;
}
