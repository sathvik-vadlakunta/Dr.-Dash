import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  fredId: z.string().trim().min(1, "Pick a series.").max(64),
  note: z.string().trim().max(1000).optional(),
});

/** Section 9.5. Any signed-in user may ask for a public FRED series. */
export const POST = withRoute("seriesRequests.create", async (request) => {
  const user = await requireUser();
  const body = createSchema.parse(await readJson(request));

  const already = await prisma.series.findUnique({
    where: { fredId: body.fredId },
    select: { slug: true },
  });
  if (already) {
    throw HttpError.conflict("ALREADY_IN_CATALOG", `${body.fredId} is already in the catalog.`);
  }

  const pending = await prisma.seriesRequest.findFirst({
    where: { userId: user.id, fredId: body.fredId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    throw HttpError.conflict("DUPLICATE_REQUEST", "You have already requested that series.");
  }

  const created = await prisma.seriesRequest.create({
    data: { userId: user.id, fredId: body.fredId, note: body.note ?? null },
  });

  return ok(created, {}, 201);
});

export const GET = withRoute("seriesRequests.list", async (request) => {
  const user = await requireUser();
  const all = new URL(request.url).searchParams.get("all") === "1";

  if (all && user.role !== "ADMIN") {
    throw HttpError.forbidden("ADMIN_REQUIRED", "Only administrators can see every request.");
  }

  const rows = await prisma.seriesRequest.findMany({
    where: all ? {} : { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: all ? { user: { select: { name: true, email: true } } } : undefined,
  });

  return ok(rows);
});
