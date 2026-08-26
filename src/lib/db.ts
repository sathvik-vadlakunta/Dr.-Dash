import { PrismaClient, type Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { RECESSION_SLUG } from "@/lib/dashboard/defaults";
import { TransformError, type Point, type SeriesData } from "@/lib/series/types";

/**
 * One PrismaClient per process. Next.js dev reloads the module graph on every
 * edit, so the client is parked on `globalThis` to avoid exhausting Postgres
 * connections with a new pool per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!config.isProduction) globalForPrisma.prisma = prisma;

// ---------------------------------------------------------------------------
// Loading catalog rows as the engine's `SeriesData`.
//
// The transform engine takes a `loader` callback and never touches Prisma
// itself (Section 24, Phase 3 acceptance). This is the one place that callback
// is implemented, so the visibility rules and the base-unit metadata are
// applied identically by /plot, /series/:slug/observations, and the lesson
// evaluator.
// ---------------------------------------------------------------------------

export const SERIES_FIELDS = {
  id: true,
  slug: true,
  source: true,
  title: true,
  shortLabel: true,
  description: true,
  units: true,
  unitsShort: true,
  unitMultiplier: true,
  frequency: true,
  seasonalAdjustment: true,
  kind: true,
  isNominal: true,
  isRealAlready: true,
  canReal: true,
  canPerCapita: true,
  canGrowth: true,
  canBeDenominator: true,
  defaultDeflator: true,
  defaultPopulation: true,
  aggregation: true,
  sourceName: true,
  sourceUrl: true,
  notes: true,
  popularity: true,
  isPublic: true,
  ownerId: true,
  orgId: true,
  observationStart: true,
  observationEnd: true,
  fredLastUpdated: true,
  lastSyncedAt: true,
} as const;

export type SeriesRow = Prisma.SeriesGetPayload<{ select: typeof SERIES_FIELDS }>;

export interface Viewer {
  id: string;
  orgId: string | null;
}

/**
 * Section 9.4 and 10.2. A public series is visible to everyone; a user series
 * only to its owner; an org series to that org's members. Anything else is
 * absent rather than forbidden.
 */
export function visibilityWhere(viewer: Viewer | null): Prisma.SeriesWhereInput {
  if (!viewer) return { isPublic: true };
  return {
    OR: [
      { isPublic: true },
      { ownerId: viewer.id },
      ...(viewer.orgId ? [{ orgId: viewer.orgId }] : []),
    ],
  };
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toSeriesData(row: SeriesRow, points: Point[]): SeriesData {
  return {
    slug: row.slug,
    shortLabel: row.shortLabel,
    frequency: row.frequency,
    kind: row.kind,
    units: row.units,
    unitsShort: row.unitsShort,
    unitMultiplier: row.unitMultiplier,
    aggregation: row.aggregation,
    isNominal: row.isNominal,
    isRealAlready: row.isRealAlready,
    points,
    flags: {
      isPopulation: row.notes?.startsWith("POPULATION:") ?? false,
      canReal: row.canReal,
      canPerCapita: row.canPerCapita,
      canGrowth: row.canGrowth,
      canBeDenominator: row.canBeDenominator,
      defaultDeflator: row.defaultDeflator,
      defaultPopulation: row.defaultPopulation,
    },
  };
}

export interface LoadOptions {
  start?: string | null;
  end?: string | null;
  viewer?: Viewer | null;
  /**
   * USREC is `isPublic = false` because it must never appear in the catalog
   * tree, but the recession bands behind every chart are drawn from it. Set
   * this only for that internal read.
   */
  includeHidden?: boolean;
}

/**
 * Load several series and their observations in two queries, not two per
 * series. Section 10.4's latency budget for `/plot` depends on this.
 */
export async function loadSeriesBySlugs(
  slugs: string[],
  options: LoadOptions = {},
): Promise<Map<string, { row: SeriesRow; data: SeriesData }>> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return new Map();

  const rows = await prisma.series.findMany({
    where: {
      slug: { in: unique },
      ...(options.includeHidden ? {} : { AND: [visibilityWhere(options.viewer ?? null)] }),
    },
    select: SERIES_FIELDS,
  });
  if (rows.length === 0) return new Map();

  const observations = await prisma.observation.findMany({
    where: {
      seriesId: { in: rows.map((r) => r.id) },
      ...(options.start || options.end
        ? {
            date: {
              ...(options.start ? { gte: new Date(`${options.start}T00:00:00Z`) } : {}),
              ...(options.end ? { lte: new Date(`${options.end}T00:00:00Z`) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ seriesId: "asc" }, { date: "asc" }],
    // Only the two columns the engine reads.
    select: { seriesId: true, date: true, value: true },
  });

  const bySeries = new Map<string, Point[]>();
  for (const o of observations) {
    const list = bySeries.get(o.seriesId);
    const point = { date: isoDate(o.date), value: o.value };
    if (list) list.push(point);
    else bySeries.set(o.seriesId, [point]);
  }

  const out = new Map<string, { row: SeriesRow; data: SeriesData }>();
  for (const row of rows) {
    out.set(row.slug, { row, data: toSeriesData(row, bySeries.get(row.id) ?? []) });
  }
  return out;
}

/**
 * The engine's `loader` callback. Helper series (deflator, population,
 * denominator) are loaded over their whole history, not the plotted range,
 * because a base year can sit outside the window the user is looking at
 * (Section 10.4).
 */
export function makeSeriesLoader(
  viewer: Viewer | null,
  preloaded: Map<string, SeriesData> = new Map(),
): (slug: string) => Promise<SeriesData> {
  const cache = new Map(preloaded);

  return async (slug: string): Promise<SeriesData> => {
    const hit = cache.get(slug);
    if (hit) return hit;

    // USREC is hidden from the catalog but is what recession questions and the
    // chart's bands are both computed from.
    const loaded = await loadSeriesBySlugs([slug], {
      viewer,
      includeHidden: slug === RECESSION_SLUG,
    });
    const found = loaded.get(slug);
    if (!found) {
      throw new TransformError("SERIES_NOT_FOUND", `${slug} is not available.`, { slug });
    }
    cache.set(slug, found.data);
    return found.data;
  };
}

// ---------------------------------------------------------------------------
// Section 9.1: category resolution.
//
// System categories are never copied to a user. The first time a user edits
// one, an overlay is created with the same slug and `ownerId` set, and the
// resolver swaps it in. That is what lets two accounts reorganise the same
// starting catalog without either seeing the other's edits.
// ---------------------------------------------------------------------------

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  isOverride: boolean;
  sortOrder: number;
  seriesCount: number;
  children: CategoryNode[];
}

export const MAX_CATEGORY_DEPTH = 3;

type CategoryRow = Prisma.CategoryGetPayload<{
  select: {
    id: true;
    slug: true;
    name: true;
    parentId: true;
    ownerId: true;
    orgId: true;
    sortOrder: true;
    isSystem: true;
  };
}>;

const CATEGORY_FIELDS = {
  id: true,
  slug: true,
  name: true,
  parentId: true,
  ownerId: true,
  orgId: true,
  sortOrder: true,
  isSystem: true,
} as const;

export async function resolveCategoryTree(viewer: Viewer | null): Promise<CategoryNode[]> {
  const rows = await prisma.category.findMany({
    where: {
      OR: [
        { ownerId: null, orgId: null },
        ...(viewer ? [{ ownerId: viewer.id }] : []),
        ...(viewer?.orgId ? [{ orgId: viewer.orgId }] : []),
      ],
    },
    select: CATEGORY_FIELDS,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const system = rows.filter((r) => r.ownerId === null && r.orgId === null);
  const owned = rows.filter((r) => r.ownerId !== null || r.orgId !== null);
  const overrideBySlug = new Map(owned.map((r) => [r.slug, r]));

  // Start with the system set, replace any slug the user has overridden, then
  // append the user's own categories.
  const resolved: Array<{ row: CategoryRow; isOverride: boolean; isSystem: boolean }> = [];
  const usedOverrides = new Set<string>();

  for (const s of system) {
    const override = overrideBySlug.get(s.slug);
    if (override) {
      usedOverrides.add(override.id);
      resolved.push({ row: override, isOverride: true, isSystem: true });
    } else {
      resolved.push({ row: s, isOverride: false, isSystem: true });
    }
  }
  for (const o of owned) {
    if (usedOverrides.has(o.id)) continue;
    resolved.push({ row: o, isOverride: false, isSystem: false });
  }

  const counts = await prisma.categorySeries.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: resolved.map((r) => r.row.id) } },
    _count: { seriesId: true },
  });
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count.seriesId]));

  const nodes = new Map<string, CategoryNode>();
  for (const { row, isOverride, isSystem } of resolved) {
    nodes.set(row.id, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      isSystem,
      isOverride,
      sortOrder: row.sortOrder,
      seriesCount: countByCategory.get(row.id) ?? 0,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const { row } of resolved) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (list: CategoryNode[]): CategoryNode[] => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of list) sortTree(n.children);
    return list;
  };

  return sortTree(roots);
}

/**
 * Section 9.1 step 2. Editing a system category transparently creates the
 * caller's overlay first, keyed on the same slug, and applies the edit there.
 */
export async function overlayFor(categoryId: string, viewer: Viewer): Promise<string> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: CATEGORY_FIELDS,
  });
  if (!category) return categoryId;
  if (category.ownerId !== null || category.orgId !== null) return categoryId;

  const existing = await prisma.category.findFirst({
    where: { ownerId: viewer.id, slug: category.slug },
    select: { id: true },
  });
  if (existing) return existing.id;

  const overlay = await prisma.category.create({
    data: {
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      ownerId: viewer.id,
      sortOrder: category.sortOrder,
      isSystem: false,
    },
    select: { id: true },
  });

  // The overlay starts as a copy of the system category's membership, so
  // "remove one series" does not read as "empty the category".
  const links = await prisma.categorySeries.findMany({
    where: { categoryId: category.id },
    select: { seriesId: true, sortOrder: true },
  });
  if (links.length > 0) {
    await prisma.categorySeries.createMany({
      data: links.map((l) => ({
        categoryId: overlay.id,
        seriesId: l.seriesId,
        sortOrder: l.sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  return overlay.id;
}

/** Section 10.4: slugify a name, suffixing on collision within the owner. */
export async function uniqueCategorySlug(name: string, ownerId: string | null): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "category";

  const taken = await prisma.category.findMany({
    where: { ownerId, slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;

  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Section 9.1 rule 6: at most three levels of nesting. This returns the depth
 * of `parentId` itself, counting a root category as 1, so a caller adding a
 * child rejects at `depth >= MAX_CATEGORY_DEPTH`: a child of a level-3 category
 * would be level 4.
 */
export async function categoryDepth(parentId: string | null): Promise<number> {
  let depth = 0;
  let cursor = parentId;
  while (cursor && depth < 10) {
    const parent = await prisma.category.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    if (!parent) break;
    depth += 1;
    cursor = parent.parentId;
  }
  return depth;
}

// ---------------------------------------------------------------------------
// Published dashboards (Section 17).

/**
 * Section 17.1 and 17.2 both start by reading a published dashboard, and so
 * does the OG image, so all three go through one function. It calls the public
 * API route rather than Prisma so that the page and the endpoint can never
 * disagree about what is published, and so a page view is counted the same way
 * an API read is.
 *
 * The origin comes from the request rather than `NEXT_PUBLIC_APP_URL`: a
 * deployment reached on a second hostname, or on a test port, still has to be
 * able to read itself. `next/headers` is imported lazily because this module is
 * also loaded by the CLI scripts, which have no request to read.
 */
export async function fetchPublishedDashboard(token: string): Promise<PublicDashboardDto | null> {
  const { headers } = await import("next/headers");
  const h = await headers();

  const host = h.get("host");
  if (!host) return null;
  const proto =
    h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");

  const res = await fetch(
    `${proto}://${host}/api/v1/public/dashboards/${encodeURIComponent(token)}`,
    {
      cache: "no-store",
      // Carried through so the once-per-hour view count is per visitor, not
      // per server.
      headers: { "x-forwarded-for": h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "" },
    },
  );

  if (!res.ok) return null;
  return ((await res.json()) as { data: PublicDashboardDto }).data;
}

export interface PublicDashboardDto {
  title: string;
  description: string | null;
  state: unknown;
  allowEmbed: boolean;
  owner: { name: string; orgName: string | null };
}
