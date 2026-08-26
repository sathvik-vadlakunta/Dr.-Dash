import { getSession } from "@/lib/auth/session";
import { defaultPopulationSlug } from "@/lib/dashboard/defaults";
import { loadSeriesBySlugs } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import { capabilitiesFor, disabledReasons } from "@/lib/series/capabilities";
import { validBaseYears } from "@/lib/series/real";
import { emptyTransform } from "@/lib/series/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.4, `GET /api/v1/series/:slug`. Everything the transform panel
 * needs to render itself before the first chart request: which controls are
 * usable, why the others are not, and which base years the deflator can answer
 * for.
 */
export const GET = withRoute(
  "series.get",
  async (_request, _context, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const session = await getSession();
    const viewer = session?.user ?? null;

    const loaded = await loadSeriesBySlugs([slug], { viewer });
    const found = loaded.get(slug);
    if (!found) throw HttpError.notFound(`${slug} is not available.`);

    const { row, data } = found;

    // The deflator decides which base years the real control can offer.
    const deflatorSlug = row.defaultDeflator;
    let years: number[] = [];
    if (deflatorSlug) {
      const deflator = (await loadSeriesBySlugs([deflatorSlug], { viewer })).get(deflatorSlug);
      if (deflator) years = validBaseYears(deflator.data);
    }

    const caps = capabilitiesFor(data, emptyTransform(), {
      deflatorHasNoValidBaseYear: row.canReal && years.length === 0,
    });

    return ok({
      // The category link endpoints address a series by id, so the detail
      // response has to carry one.
      id: row.id,
      slug: row.slug,
      shortLabel: row.shortLabel,
      title: row.title,
      description: row.description,
      units: row.units,
      unitsShort: row.unitsShort,
      unitMultiplier: row.unitMultiplier,
      frequency: row.frequency,
      seasonalAdjustment: row.seasonalAdjustment,
      kind: row.kind,
      source: row.source,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      notes: row.notes,
      observationStart: row.observationStart?.toISOString().slice(0, 10) ?? null,
      observationEnd: row.observationEnd?.toISOString().slice(0, 10) ?? null,
      fredLastUpdated: row.fredLastUpdated?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      validBaseYears: years,
      defaultDeflator: row.defaultDeflator,
      defaultPopulation: row.defaultPopulation ?? defaultPopulationSlug(data.frequency),
      capabilities: {
        real: caps.real.enabled,
        perCapita: caps.perCapita.enabled,
        growth: caps.growth.enabled,
        denominator: caps.denominator.enabled,
      },
      disabledReasons: disabledReasons(caps),
      inDatabase: true,
    });
  },
);
