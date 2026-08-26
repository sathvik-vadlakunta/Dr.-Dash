import { PrismaClient } from "@prisma/client";
import { config } from "../src/lib/config";
import { syncAll } from "../src/lib/fred/sync";

/**
 * Section 8.6. `pnpm sync [--series=ID,ID] [--full]`.
 *
 * With no FRED key it exits 0 without doing anything, because the documented
 * first-run sequence (Section 23.3) runs it unconditionally and a fresh clone
 * without a key must still complete that sequence.
 */

function parseArgs(argv: string[]): { slugs: string[] | null; full: boolean } {
  let slugs: string[] | null = null;
  let full = false;

  for (const arg of argv) {
    if (arg === "--full") {
      full = true;
      continue;
    }
    const match = /^--series=(.*)$/.exec(arg);
    if (match) {
      slugs = (match[1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      continue;
    }
    if (arg.startsWith("--")) {
      process.stderr.write(`Unknown flag ${arg}. Usage: pnpm sync [--series=ID,ID] [--full]\n`);
      process.exit(2);
    }
  }

  return { slugs, full };
}

function table(rows: Array<Record<string, string>>, columns: string[]): string {
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => (r[c] ?? "").length)),
  );
  const line = (cells: string[]) =>
    `  ${cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ")}\n`;
  return (
    line(columns) +
    line(widths.map((w) => "-".repeat(w))) +
    rows.map((r) => line(columns.map((c) => r[c] ?? ""))).join("")
  );
}

async function main(): Promise<void> {
  if (!config.hasFredKey) {
    process.stdout.write(
      "FRED_API_KEY is empty, so there is nothing to sync. " +
        "The seeded offline fixtures already make the app usable; set a key to pull live data.\n",
    );
    return;
  }

  const { slugs, full } = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  const startedAt = Date.now();

  try {
    const result = await syncAll({ slugs, full, db, triggeredBy: "cli" });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    const rows = result.results
      .map((r) => ({
        series: r.slug,
        outcome: r.updated ? "updated" : (r.reason ?? "skipped"),
        observations: r.observationsWritten > 0 ? String(r.observationsWritten) : "",
      }))
      .sort((a, b) => a.series.localeCompare(b.series));

    process.stdout.write(`\n${table(rows, ["series", "outcome", "observations"])}\n`);
    process.stdout.write(
      `${result.status}: ${result.seriesUpdated} of ${result.seriesAttempted} series updated, ` +
        `${result.observationsWritten} observations written in ${elapsed}s ` +
        `(sync run ${result.syncRunId}).\n`,
    );

    if (result.errors.length > 0) {
      process.stderr.write(`\n${result.errors.length} series failed:\n`);
      for (const e of result.errors) process.stderr.write(`  - ${e.slug}: ${e.code} ${e.message}\n`);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`sync failed: ${(error as Error).message}\n`);
  process.exit(1);
});
