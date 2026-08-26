import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/guards";
import {
  MAX_CATEGORY_DEPTH,
  categoryDepth,
  prisma,
  resolveCategoryTree,
  uniqueCategorySlug,
} from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 10.4. `?tree=1` returns the resolved tree of Section 9.1. */
export const GET = withRoute("categories.list", async (request) => {
  const session = await getSession();
  const tree = await resolveCategoryTree(session?.user ?? null);

  const url = new URL(request.url);
  if (url.searchParams.get("tree") === "1") return ok(tree);

  // Flat form, for the pickers that do not draw a tree.
  const flatten = (nodes: typeof tree): typeof tree =>
    nodes.flatMap((n) => [{ ...n, children: [] }, ...flatten(n.children)]);
  return ok(flatten(tree));
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the category.").max(80),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const POST = withRoute("categories.create", async (request) => {
  const user = await requireUser();
  const body = createSchema.parse(await readJson(request));

  const parentId = body.parentId ?? null;
  if (parentId) {
    const depth = await categoryDepth(parentId);
    if (depth >= MAX_CATEGORY_DEPTH) {
      throw HttpError.unprocessable(
        "CATEGORY_TOO_DEEP",
        `Categories nest at most ${MAX_CATEGORY_DEPTH} levels deep.`,
      );
    }
  }

  const category = await prisma.category.create({
    data: {
      name: body.name,
      slug: await uniqueCategorySlug(body.name, user.id),
      parentId,
      ownerId: user.id,
      sortOrder: body.sortOrder ?? 0,
      isSystem: false,
    },
  });

  return ok(category, {}, 201);
});
