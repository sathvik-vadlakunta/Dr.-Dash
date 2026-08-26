import { config } from "../src/lib/config";
import { getSeriesMeta, FredBadSeriesError } from "../src/lib/fred/client";
import { mapFrequency } from "../src/lib/fred/map";
import { COMPUTED_SERIES, topologicalOrder } from "../src/lib/series/computed";
import { checkSeriesInvariants } from "../src/lib/series/types";
import { CATEGORY_SLUGS } from "../prisma/seed/categories";
import { SEED_SERIES, SEED_SERIES_BY_SLUG } from "../prisma/seed/series";

/**
 * Section 7.4. `pnpm check:catalog`, run in CI and in `pnpm verify`.
 *
 * Without a FRED key it checks the invariants only, which is what CI does.
 * With a key it also verifies every seeded id still resolves at FRED and that
 * the frequency and units the catalog claims still match what FRED reports.
 */

const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function checkInvariants(): void {
  const slugs = new Set<string>();

  for (const s of SEED_SERIES) {
    if (slugs.has(s.slug)) fail(`${s.slug}: duplicate slug in the seed catalog`);
    slugs.add(s.slug);

    for (const v of checkSeriesInvariants(s)) {
      fail(`${v.slug}: Section 5.2 rule ${v.rule}: ${v.message}`);
    }

    if (!CATEGORY_SLUGS.includes(s.categorySlug)) {
      fail(`${s.slug}: category ${s.categorySlug} is not one of the Section 7.1 categories`);
    }
    if (s.source === "FRED" && s.fredId !== s.slug) {
      fail(`${s.slug}: a FRED series' slug must equal its fredId`);
    }
    if (s.source === "CONSTRUCTED" && s.fredId !== null) {
      fail(`${s.slug}: a constructed series must not carry a fredId`);
    }
    if (s.shortLabel.length > 28) {
      fail(`${s.slug}: shortLabel is ${s.shortLabel.length} characters, the limit is 28`);
    }
  }

  // Section 7.3: the constructed registry and the seeded metadata must agree,
  // and their dependencies must all exist and be acyclic.
  for (const def of COMPUTED_SERIES) {
    const seeded = SEED_SERIES_BY_SLUG.get(def.slug);
    if (!seeded) {
      fail(`${def.slug}: in COMPUTED_SERIES but not seeded in prisma/seed/series.ts`);
      continue;
    }
    if (seeded.source !== "CONSTRUCTED") fail(`${def.slug}: seeded source must be CONSTRUCTED`);
    if (seeded.frequency !== def.frequency) {
      fail(`${def.slug}: frequency ${seeded.frequency} does not match the registry's ${def.frequency}`);
    }
    if (seeded.kind !== def.kind) {
      fail(`${def.slug}: kind ${seeded.kind} does not match the registry's ${def.kind}`);
    }
    if (seeded.canGrowth !== def.canGrowth) {
      fail(`${def.slug}: canGrowth ${seeded.canGrowth} does not match the registry's ${def.canGrowth}`);
    }
    for (const dep of def.dependsOn) {
      if (!SEED_SERIES_BY_SLUG.has(dep)) fail(`${def.slug}: depends on unseeded series ${dep}`);
    }
  }

  try {
    topologicalOrder();
  } catch (error) {
    fail(`constructed series: ${(error as Error).message}`);
  }

  // Every deflator and population a row names has to exist in the catalog.
  for (const s of SEED_SERIES) {
    if (s.defaultDeflator && !SEED_SERIES_BY_SLUG.has(s.defaultDeflator)) {
      fail(`${s.slug}: defaultDeflator ${s.defaultDeflator} is not seeded`);
    }
    if (s.defaultPopulation && !SEED_SERIES_BY_SLUG.has(s.defaultPopulation)) {
      fail(`${s.slug}: defaultPopulation ${s.defaultPopulation} is not seeded`);
    }
  }
}

interface Mismatch {
  slug: string;
  field: string;
  seeded: string;
  fred: string;
}

async function checkAgainstFred(): Promise<void> {
  const fredRows = SEED_SERIES.filter((s) => s.source === "FRED");
  const mismatches: Mismatch[] = [];
  let resolved = 0;

  for (const s of fredRows) {
    if (!s.fredId) continue;
    try {
      const meta = await getSeriesMeta(s.fredId);
      resolved += 1;

      let mappedFrequency: string;
      try {
        mappedFrequency = mapFrequency(meta.frequency_short);
      } catch {
        mappedFrequency = `UNSUPPORTED(${meta.frequency_short})`;
      }
      if (mappedFrequency !== s.frequency) {
        mismatches.push({
          slug: s.slug,
          field: "frequency",
          seeded: s.frequency,
          fred: mappedFrequency,
        });
      }
      if (meta.units.trim().toLowerCase() !== s.units.trim().toLowerCase()) {
        mismatches.push({ slug: s.slug, field: "units", seeded: s.units, fred: meta.units });
      }
    } catch (error) {
      if (error instanceof FredBadSeriesError) {
        fail(`${s.slug}: FRED does not recognise this id`);
      } else {
        fail(`${s.slug}: could not verify against FRED (${(error as Error).message})`);
      }
    }
  }

  process.stdout.write(`\nResolved ${resolved} of ${fredRows.length} FRED ids.\n`);

  if (mismatches.length > 0) {
    const width = (pick: (m: Mismatch) => string, head: string) =>
      Math.max(head.length, ...mismatches.map((m) => pick(m).length));
    const wSlug = width((m) => m.slug, "slug");
    const wField = width((m) => m.field, "field");
    const wSeeded = width((m) => m.seeded, "seeded");

    process.stdout.write("\nMetadata differs from FRED:\n\n");
    process.stdout.write(
      `  ${"slug".padEnd(wSlug)}  ${"field".padEnd(wField)}  ${"seeded".padEnd(wSeeded)}  fred\n`,
    );
    process.stdout.write(`  ${"-".repeat(wSlug)}  ${"-".repeat(wField)}  ${"-".repeat(wSeeded)}  ----\n`);
    for (const m of mismatches) {
      process.stdout.write(
        `  ${m.slug.padEnd(wSlug)}  ${m.field.padEnd(wField)}  ${m.seeded.padEnd(wSeeded)}  ${m.fred}\n`,
      );
      fail(`${m.slug}: ${m.field} differs from FRED (seeded "${m.seeded}", FRED "${m.fred}")`);
    }
    process.stdout.write("\n");
  }
}

async function main(): Promise<void> {
  checkInvariants();

  const fredCount = SEED_SERIES.filter((s) => s.source === "FRED").length;
  const constructedCount = SEED_SERIES.filter((s) => s.source === "CONSTRUCTED").length;
  process.stdout.write(
    `Catalog: ${SEED_SERIES.length} series (${fredCount} FRED, ${constructedCount} constructed) ` +
      `across ${CATEGORY_SLUGS.length} categories.\n`,
  );

  if (config.hasFredKey) {
    await checkAgainstFred();
  } else {
    process.stdout.write(
      "FRED_API_KEY is empty, so live metadata verification was skipped (invariants only).\n",
    );
  }

  if (failures.length > 0) {
    process.stderr.write(`\ncheck:catalog failed with ${failures.length} problem(s):\n`);
    for (const f of failures) process.stderr.write(`  - ${f}\n`);
    process.exit(1);
  }

  process.stdout.write("check:catalog passed.\n");
}

void main().catch((error: unknown) => {
  process.stderr.write(`check:catalog crashed: ${(error as Error).message}\n`);
  process.exit(1);
});
