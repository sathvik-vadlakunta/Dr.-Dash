import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.9. No auth, and deliberately *not* wrapped in the `{data, meta}`
 * envelope: `/api/health` sits outside `/api/v1`, and probes read the top-level
 * keys directly.
 */
export async function GET(): Promise<Response> {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  try {
    const [seriesCount, latest] = await Promise.all([
      prisma.series.count(),
      prisma.syncRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true, startedAt: true },
      }),
    ]);

    return new Response(
      JSON.stringify({
        status: "ok",
        db: "ok",
        latestSync: (latest?.finishedAt ?? latest?.startedAt)?.toISOString() ?? null,
        seriesCount,
      }),
      { status: 200, headers },
    );
  } catch (error) {
    logger.error("health.db_check_failed", { error });
    return new Response(JSON.stringify({ status: "error", db: "unavailable" }), {
      status: 503,
      headers,
    });
  }
}
