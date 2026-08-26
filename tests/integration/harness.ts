import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { config } from "@/lib/config";

/**
 * Section 22.3: never share mutable state between test files. Each file asks
 * for its own Postgres schema, gets migrations applied into it, and drops it
 * afterwards, so the files can be read (and debugged) in any order.
 */

export interface TestDatabase {
  prisma: PrismaClient;
  schema: string;
  url: string;
  drop(): Promise<void>;
}

function urlWithSchema(base: string, schema: string): string {
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

export async function createTestSchema(name: string): Promise<TestDatabase> {
  const base = config.DATABASE_URL;

  const schema = `it_${name.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
  const url = urlWithSchema(base, schema);

  // A previous run that crashed mid-migration would leave a failed migration
  // row behind and `migrate deploy` refuses to proceed past one, so start from
  // nothing every time.
  const admin = new PrismaClient({ datasourceUrl: base });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }

  // `migrate deploy` creates the schema and applies every migration into it.
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ datasourceUrl: url });

  return {
    prisma,
    schema,
    url,
    async drop() {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    },
  };
}

/** Seed the catalog into a test schema without going through the CLI. */
export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  const { SEED_CATEGORIES } = await import("../../prisma/seed/categories");
  const { SEED_SERIES } = await import("../../prisma/seed/series");

  const categoryIds = new Map<string, string>();
  for (const c of SEED_CATEGORIES) {
    const row = await prisma.category.create({
      data: {
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isSystem: true,
      },
      select: { id: true },
    });
    categoryIds.set(c.slug, row.id);
  }

  for (const [i, s] of SEED_SERIES.entries()) {
    const { categorySlug, ...fields } = s;
    const categoryId = categoryIds.get(categorySlug);
    if (!categoryId) throw new Error(`Unknown category ${categorySlug}`);
    const series = await prisma.series.create({ data: fields, select: { id: true } });
    await prisma.categorySeries.create({
      data: { categoryId, seriesId: series.id, sortOrder: i },
    });
  }
}
