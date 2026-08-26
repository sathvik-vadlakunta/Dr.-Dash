import { z } from "zod";
import { requireOwnedDashboard } from "@/lib/auth/guards";
import { dashboardStateSchema } from "@/lib/dashboard/urlState";
import { prisma } from "@/lib/db";
import { noContent, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  state: dashboardStateSchema.optional(),
});

export const GET = withRoute(
  "dashboards.get",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    return ok(await requireOwnedDashboard(id));
  },
);

export const PATCH = withRoute(
  "dashboards.patch",
  async (request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireOwnedDashboard(id);
    const body = patchSchema.parse(await readJson(request));

    const updated = await prisma.dashboard.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.state !== undefined ? { stateJson: body.state } : {}),
      },
    });
    return ok(updated);
  },
);

export const DELETE = withRoute(
  "dashboards.delete",
  async (_request, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireOwnedDashboard(id);
    await prisma.dashboard.delete({ where: { id } });
    return noContent();
  },
);
