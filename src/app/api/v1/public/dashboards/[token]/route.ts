import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/http/ratelimit";
import { HttpError, ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.6. No session required: this is the endpoint that lets an agency
 * publish data the public can examine, transform, and download without
 * contacting the entity.
 */

const VIEW_WINDOW_MS = 60 * 60 * 1000;
const recentViews = new Map<string, number>();

/** At most one counted view per token per IP per hour. */
function countView(token: string, ip: string): boolean {
  const key = `${token}:${ip}`;
  const now = Date.now();
  const last = recentViews.get(key);
  if (last !== undefined && now - last < VIEW_WINDOW_MS) return false;

  recentViews.set(key, now);
  if (recentViews.size > 10_000) {
    for (const [k, at] of recentViews) {
      if (now - at >= VIEW_WINDOW_MS) recentViews.delete(k);
    }
  }
  return true;
}

export const GET = withRoute(
  "public.dashboard",
  async (request, _context, { params }: { params: Promise<{ token: string }> }) => {
    const { token } = await params;

    const dashboard = await prisma.dashboard.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        title: true,
        description: true,
        stateJson: true,
        isPublic: true,
        allowEmbed: true,
        owner: { select: { name: true, org: { select: { name: true } } } },
      },
    });

    if (!dashboard || !dashboard.isPublic) {
      throw HttpError.notFound("That dashboard does not exist.");
    }

    if (countView(token, clientIp(request))) {
      void prisma.dashboard
        .update({ where: { id: dashboard.id }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);
    }

    return ok(
      {
        title: dashboard.title,
        description: dashboard.description,
        state: dashboard.stateJson,
        allowEmbed: dashboard.allowEmbed,
        owner: { name: dashboard.owner.name, orgName: dashboard.owner.org?.name ?? null },
      },
      {},
      200,
      { "cache-control": "public, max-age=300" },
    );
  },
);
