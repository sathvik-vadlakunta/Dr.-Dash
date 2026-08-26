import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { syncAll } from "@/lib/fred/sync";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full resync of the catalog runs well past a default serverless timeout.
export const maxDuration = 300;

const bodySchema = z.object({
  slugs: z.array(z.string()).nullable().default(null),
  full: z.boolean().default(false),
});

/**
 * A scheduler proves itself with the shared secret. `x-cron-secret` is the
 * header a container cron or a CI job sends; `Authorization: Bearer` is what
 * Vercel's scheduler sends and cannot be configured away (Section 23.8, path B).
 */
function isScheduler(request: Request): boolean {
  if (config.CRON_SECRET.length === 0) return false;
  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  return header === config.CRON_SECRET || bearer === config.CRON_SECRET;
}

async function startSync(request: Request, body: z.infer<typeof bodySchema>, triggeredBy: string) {
  if (!config.hasFredKey) {
    throw HttpError.unavailable("FRED_KEY_MISSING", "Set FRED_API_KEY to sync live data.");
  }

  // Kick the job off and answer immediately; progress is read from
  // GET /api/v1/admin/sync/status.
  const started = syncAll({ slugs: body.slugs, full: body.full, triggeredBy });
  void started.catch((error: unknown) => logger.error("sync.failed", { error }));

  const runId = await Promise.race([
    started.then((r) => r.syncRunId),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
  ]);

  return ok({ syncRunId: runId, triggeredBy, full: body.full }, {}, 202);
}

/**
 * Section 23.8, path B. Vercel's scheduler can only issue `GET`, so this is the
 * scheduler's door and nothing else's: it never accepts a session, so no link a
 * browser can follow starts a sync, and without the shared secret it is a 401.
 */
export const GET = withRoute("admin.sync.scheduled", async (request) => {
  if (!isScheduler(request)) throw HttpError.unauthorized();
  return startSync(request, bodySchema.parse({}), "cron");
});

/**
 * Section 8.6. Either a scheduler's shared secret or an authenticated ADMIN
 * session. Returns `202` and runs the job without blocking the response.
 */
export const POST = withRoute("admin.sync", async (request) => {
  const viaCron = isScheduler(request);

  let triggeredBy = "cron";
  if (!viaCron) {
    const session = await getSession();
    if (!session) throw HttpError.unauthorized();
    if (session.user.role !== "ADMIN") {
      throw HttpError.forbidden("ADMIN_REQUIRED", "Only administrators can trigger a sync.");
    }
    triggeredBy = `admin:${session.user.id}`;
  }

  const body = bodySchema.parse(await readJson(request).catch(() => ({})));

  return startSync(request, body, triggeredBy);
});
