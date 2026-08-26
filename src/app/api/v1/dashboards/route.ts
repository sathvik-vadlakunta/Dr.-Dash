import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { dashboardStateSchema } from "@/lib/dashboard/urlState";
import { prisma } from "@/lib/db";
import { ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1, "Name the dashboard.").max(140),
  description: z.string().trim().max(2000).optional(),
  state: dashboardStateSchema,
});

export const GET = withRoute("dashboards.list", async () => {
  const user = await requireUser();
  const rows = await prisma.dashboard.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok(rows);
});

export const POST = withRoute("dashboards.create", async (request) => {
  const user = await requireUser();
  const body = createSchema.parse(await readJson(request));

  const dashboard = await prisma.dashboard.create({
    data: {
      ownerId: user.id,
      title: body.title,
      description: body.description ?? null,
      stateJson: body.state,
    },
  });

  return ok(dashboard, {}, 201);
});
