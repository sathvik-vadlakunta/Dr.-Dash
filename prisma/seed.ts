import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { config } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { recomputeConstructedSeries, upsertObservations } from "../src/lib/fred/sync";
import { COMPUTED_SERIES } from "../src/lib/series/computed";
import type { Point } from "../src/lib/series/types";
import { lessonContentSchema, maxScoreOf } from "../src/lib/lessons/schema";
import { SEED_CATEGORIES } from "./seed/categories";
import { LESSON_01 } from "./seed/lessons/01-levels-vs-growth";
import { LESSON_02 } from "./seed/lessons/02-nominal-vs-real";
import { LESSON_03 } from "./seed/lessons/03-per-capita";
import { LESSON_04 } from "./seed/lessons/04-inflation-from-index";
import { LESSON_05 } from "./seed/lessons/05-shares-of-gdp";
import { LESSON_06 } from "./seed/lessons/06-labor-market";
import { SEED_SERIES, assertSeedInvariants } from "./seed/series";
import {
  DEMO_COURSE,
  DEMO_DASHBOARD,
  DEMO_ORG,
  DEMO_USERS,
  demoPasswordHash,
} from "./seed/users";

/**
 * `pnpm db:seed`. Idempotent: run it as many times as you like. Categories and
 * series are upserted by slug, so re-seeding after a catalog edit updates rows
 * in place and never orphans observations.
 *
 * Flags:
 *   --computed-only   refresh only the Dr. Dash constructed series' metadata
 *                     (Section 7.3, "a migration-free reseed")
 */

const prisma = new PrismaClient();

const flags = new Set(process.argv.slice(2));
const computedOnly = flags.has("--computed-only");

async function seedCategories(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const c of SEED_CATEGORIES) {
    // `@@unique([ownerId, slug])` cannot be used with `upsert` because a null
    // ownerId never matches a compound unique in Postgres, so resolve by hand.
    const existing = await prisma.category.findFirst({
      where: { slug: c.slug, ownerId: null, orgId: null },
      select: { id: true },
    });
    const data = {
      name: c.name,
      slug: c.slug,
      sortOrder: c.sortOrder,
      isSystem: true,
      ownerId: null,
      orgId: null,
      parentId: null,
    } satisfies Prisma.CategoryUncheckedCreateInput;

    const row = existing
      ? await prisma.category.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.category.create({ data, select: { id: true } });
    ids.set(c.slug, row.id);
  }
  return ids;
}

async function seedSeries(categoryIds: Map<string, string>): Promise<number> {
  const rows = computedOnly
    ? SEED_SERIES.filter((s) => s.source === "CONSTRUCTED")
    : SEED_SERIES;

  let n = 0;
  for (const s of rows) {
    const categoryId = categoryIds.get(s.categorySlug);
    if (!categoryId) throw new Error(`Missing category ${s.categorySlug} for series ${s.slug}`);

    const { categorySlug: _categorySlug, ...fields } = s;
    const series = await prisma.series.upsert({
      where: { slug: s.slug },
      create: fields,
      update: fields,
      select: { id: true },
    });

    // Every seeded series belongs to exactly one system category.
    await prisma.categorySeries.upsert({
      where: { categoryId_seriesId: { categoryId, seriesId: series.id } },
      create: { categoryId, seriesId: series.id, sortOrder: n },
      update: { sortOrder: n },
    });
    n += 1;
  }
  return n;
}


/**
 * Section 4.3. Without a FRED key the app still has to be demoable and the E2E
 * suite still has to be deterministic, so a set of series ships with real
 * observations captured from FRED and truncated to 1990-01-01 forward.
 *
 * These are only a floor: once a key is set, `pnpm sync` overwrites them with
 * the full history. The loader therefore never clears anything, it only fills
 * a series that has no observations yet.
 */
const OFFLINE_SLUGS = [
  // The eight Section 4.3 names.
  "GDP",
  "GDPC1",
  "GDPDEF",
  "CPIAUCSL",
  "UNRATE",
  "PAYEMS",
  "POPTHM",
  "USREC",
  // Ten more, each required by an acceptance criterion the eight cannot meet
  // offline. See docs/decisions.md entry 7.
  "B230RC0Q173SBEA", // lesson 3's quarterly population denominator
  "PCEC", // lesson 5
  "GPDI", // lesson 5
  "GCE", // lesson 5
  "NETEXP", // lesson 5
  "GFDEBTN", // lesson 5
  "CIVPART", // lesson 6
  "EMRATIO", // lesson 6
  "FEDFUNDS", // the "Fed funds rate" starter button, and DD_REAL_FFR
  "GDPPOT", // DD_OUTPUT_GAP
] as const;

interface OfflineFixture {
  slug: string;
  provenance: string;
  fetchedAt: string;
  observationStart: string | null;
  observationEnd: string | null;
  count: number;
  observations: Point[];
}

async function loadOfflineFixtures(): Promise<number> {
  const dir = path.join(__dirname, "seed", "offline");
  let loaded = 0;

  for (const slug of OFFLINE_SLUGS) {
    const file = path.join(dir, `${slug}.json`);
    if (!fs.existsSync(file)) {
      logger.warn("seed.offline_missing", { slug, file });
      continue;
    }

    const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
    if (!series) {
      logger.warn("seed.offline_series_missing", { slug });
      continue;
    }

    const existing = await prisma.observation.count({ where: { seriesId: series.id } });
    if (existing > 0) continue;

    const fixture = JSON.parse(fs.readFileSync(file, "utf8")) as OfflineFixture;
    const written = await upsertObservations(prisma, series.id, fixture.observations);

    await prisma.series.update({
      where: { id: series.id },
      data: {
        observationStart: fixture.observationStart
          ? new Date(`${fixture.observationStart}T00:00:00Z`)
          : null,
        observationEnd: fixture.observationEnd
          ? new Date(`${fixture.observationEnd}T00:00:00Z`)
          : null,
        fredLastUpdated: new Date(fixture.fetchedAt),
        lastSyncedAt: new Date(fixture.fetchedAt),
      },
    });

    loaded += written;
  }

  return loaded;
}

const LESSONS = [LESSON_01, LESSON_02, LESSON_03, LESSON_04, LESSON_05, LESSON_06];

/**
 * Section 19.2. The content is validated here, so a lesson naming an evaluator
 * outside the Section 19.4 whitelist, or a question with no task before it to
 * unlock it, fails `pnpm db:seed` rather than a student's attempt.
 */
async function seedLessons(): Promise<number> {
  for (const lesson of LESSONS) {
    const parsed = lessonContentSchema.parse(lesson.content);
    const maxScore = maxScoreOf(parsed);

    const data = {
      title: lesson.title,
      summary: lesson.summary,
      level: lesson.level,
      estimatedMinutes: lesson.estimatedMinutes,
      sortOrder: lesson.sortOrder,
      maxScore,
      contentJson: parsed as unknown as Prisma.InputJsonValue,
      published: true,
    };

    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      create: { slug: lesson.slug, ...data },
      update: data,
    });
  }
  return LESSONS.length;
}

async function seedDemoData(): Promise<void> {
  if (config.isProduction) {
    logger.warn("seed.demo_refused", {
      reason: "NODE_ENV is production. Demo accounts are never created in production.",
    });
    return;
  }
  if (!config.SEED_DEMO_DATA) {
    logger.info("seed.demo_skipped", { reason: "SEED_DEMO_DATA is not \"true\"." });
    return;
  }

  const passwordHash = await demoPasswordHash();
  const users = new Map<string, string>();

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG.slug },
    create: DEMO_ORG,
    update: { name: DEMO_ORG.name, instructorCode: DEMO_ORG.instructorCode },
    select: { id: true },
  });

  for (const u of DEMO_USERS) {
    const emailNormalized = u.email.trim().toLowerCase();
    const row = await prisma.user.upsert({
      where: { emailNormalized },
      create: {
        email: u.email,
        emailNormalized,
        name: u.name,
        role: u.role,
        passwordHash,
        orgId: u.role === "STUDENT" ? null : org.id,
      },
      update: { name: u.name, role: u.role, passwordHash },
      select: { id: true },
    });
    users.set(u.email, row.id);
  }

  const instructorId = users.get("instructor@drdash.test");
  if (!instructorId) return;

  const course = await prisma.course.upsert({
    where: { joinCode: DEMO_COURSE.joinCode },
    create: {
      instructorId,
      name: DEMO_COURSE.name,
      term: DEMO_COURSE.term,
      joinCode: DEMO_COURSE.joinCode,
    },
    update: { name: DEMO_COURSE.name, term: DEMO_COURSE.term, instructorId },
    select: { id: true },
  });

  for (const u of DEMO_USERS.filter((x) => x.role === "STUDENT")) {
    const userId = users.get(u.email);
    if (!userId) continue;
    await prisma.enrollment.upsert({
      where: { courseId_userId: { courseId: course.id, userId } },
      create: { courseId: course.id, userId },
      update: { status: "ACTIVE" },
    });
  }

  // Section 16.2: the landing page links here, so it has to exist before a
  // signed-out visitor ever arrives.
  await prisma.dashboard.upsert({
    where: { publicToken: DEMO_DASHBOARD.token },
    create: {
      ownerId: instructorId,
      title: DEMO_DASHBOARD.title,
      description: DEMO_DASHBOARD.description,
      stateJson: DEMO_DASHBOARD.state,
      publicToken: DEMO_DASHBOARD.token,
      isPublic: true,
      allowEmbed: true,
    },
    update: {
      ownerId: instructorId,
      title: DEMO_DASHBOARD.title,
      description: DEMO_DASHBOARD.description,
      stateJson: DEMO_DASHBOARD.state,
      isPublic: true,
      allowEmbed: true,
    },
    select: { id: true },
  });

  logger.info("seed.demo_ready", {
    users: DEMO_USERS.length,
    org: DEMO_ORG.slug,
    course: DEMO_COURSE.name,
    joinCode: DEMO_COURSE.joinCode,
    publishedToken: DEMO_DASHBOARD.token,
  });
}

async function main(): Promise<void> {
  assertSeedInvariants();

  const categoryIds = await seedCategories();
  const seriesCount = await seedSeries(categoryIds);

  let offlineObservations = 0;
  if (!config.hasFredKey) {
    offlineObservations = await loadOfflineFixtures();
  }

  // The constructed series are derived, so they are rebuilt from whatever
  // observations now exist, offline fixtures included.
  const recomputed = await recomputeConstructedSeries(prisma);

  const lessonCount = computedOnly ? 0 : await seedLessons();

  if (!computedOnly) {
    await seedDemoData();
  }

  const totals = {
    categories: await prisma.category.count({ where: { isSystem: true } }),
    series: await prisma.series.count(),
    constructed: COMPUTED_SERIES.length,
    seededThisRun: seriesCount,
    lessons: lessonCount,
    offlineObservations,
    recomputed: recomputed
      .map((r) => `${r.slug}:${r.skipped ?? r.observationsWritten}`)
      .join(" "),
    observations: await prisma.observation.count(),
  };
  logger.info("seed.complete", totals);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    logger.error("seed.failed", { error });
    await prisma.$disconnect();
    process.exitCode = 1;
  });
