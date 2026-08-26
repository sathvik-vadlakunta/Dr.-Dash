import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 8.6. The latest 20 sync runs. */
export const GET = withRoute("admin.syncStatus", async () => {
  await requireAdmin();
  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  return ok(runs);
});
