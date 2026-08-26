import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireOwnedDashboard } from "@/lib/auth/guards";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";

/**
 * The unpublish shape is first because a Zod union takes the first branch that
 * parses, and `z.object` ignores unknown keys: with the publish branch first,
 * `{unpublish: true}` parses as `{allowEmbed: false}` and republishes instead.
 */
const bodySchema = z.union([
  z.object({ unpublish: z.literal(true) }),
  z.object({ allowEmbed: z.boolean().default(false) }),
]);

/** 16 random bytes in base64url is 22 characters (Section 10.6). */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export const POST = withRoute(
  "dashboards.publish",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const dashboard = await requireOwnedDashboard(id);
    const body = bodySchema.parse(await readJson(request));

    if ("unpublish" in body) {
      await prisma.dashboard.update({
        where: { id },
        data: { publicToken: null, isPublic: false, allowEmbed: false },
      });
      return ok({ publicToken: null, url: null, embedUrl: null });
    }

    // Publishing twice keeps the same token, so an already-shared link survives.
    const publicToken = dashboard.publicToken ?? newToken();
    await prisma.dashboard.update({
      where: { id },
      data: { publicToken, isPublic: true, allowEmbed: body.allowEmbed },
    });

    const base = config.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    return ok({
      publicToken,
      url: `${base}/p/${publicToken}`,
      embedUrl: body.allowEmbed ? `${base}/embed/${publicToken}` : null,
    });
  },
);
