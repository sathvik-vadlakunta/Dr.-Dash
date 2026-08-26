import { getSession } from "@/lib/auth/session";
import { defaultPopulationSlug } from "@/lib/dashboard/defaults";
import { decodeSeries } from "@/lib/dashboard/urlState";
import { loadSeriesBySlugs, makeSeriesLoader } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import { applyTransform } from "@/lib/series/transform";
import { emptyTransform } from "@/lib/series/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Section 10.4. One transformed series. `transform` uses the same compact token
 * grammar as the dashboard URL (Section 12.4), so a link and an API call say
 * the same thing in the same words.
 */
export const GET = withRoute(
  "series.observations",
  async (request, _context, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const url = new URL(request.url);

    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (start && !ISO_DATE.test(start)) {
      throw HttpError.unprocessable("BAD_DATE", "start must be a YYYY-MM-DD date.");
    }
    if (end && !ISO_DATE.test(end)) {
      throw HttpError.unprocessable("BAD_DATE", "end must be a YYYY-MM-DD date.");
    }

    const session = await getSession();
    const viewer = session?.user ?? null;

    const loaded = await loadSeriesBySlugs([slug], { start, end, viewer });
    const found = loaded.get(slug);
    if (!found) throw HttpError.notFound(`${slug} is not available.`);

    const code = url.searchParams.get("transform");
    const decoded = code ? decodeSeries(`${slug}~${code}`) : null;
    const spec = decoded?.transform ?? emptyTransform();

    const resolved = {
      ...spec,
      deflatorSlug: spec.real ? (spec.deflatorSlug ?? found.row.defaultDeflator) : spec.deflatorSlug,
      populationSlug: spec.perCapita
        ? (spec.populationSlug ??
          found.row.defaultPopulation ??
          defaultPopulationSlug(found.data.frequency))
        : spec.populationSlug,
    };

    const result = await applyTransform(found.data, resolved, makeSeriesLoader(viewer));

    return ok(
      {
        slug,
        label: result.label,
        units: result.units,
        unitsShort: result.unitsShort,
        valueKind: result.valueKind,
        frequency: result.frequency,
        displayScale: result.displayScale,
        formulaChain: result.formulaChain,
        warnings: result.warnings,
        points: result.points,
      },
      {},
      200,
      { "cache-control": "private, max-age=60" },
    );
  },
);
