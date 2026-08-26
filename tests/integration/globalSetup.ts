import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

/**
 * Section 22.3. Runs once before the integration suite.
 *
 * Two things happen here. Importing the config loader is what makes
 * `.env.local` visible, since Vitest does not go through Next.js. And the HTTP
 * tests need a real server, so one is started against a dedicated schema:
 * routes read cookies through `next/headers`, which only exists inside a
 * request, so calling the handlers as plain functions would test something the
 * product does not do.
 *
 * Per-file isolation for the non-HTTP tests is `createTestSchema` in
 * harness.ts, which gives each file its own schema, migrated and dropped
 * around the file.
 */

export const HTTP_SCHEMA = "it_http";
export const HTTP_PORT = Number(process.env.IT_PORT ?? 3210);
export const HTTP_BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;

let server: ChildProcess | null = null;

function schemaUrl(schema: string): string {
  const url = new URL(config.DATABASE_URL);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * The suite must not run against a build that predates the routes it is
 * testing: a stale bundle answers 501 for a route that now exists, which reads
 * as a product bug rather than a test-harness one.
 */
function isBuildStale(): boolean {
  const buildId = path.join(process.cwd(), ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) return true;

  const builtAt = fs.statSync(buildId).mtimeMs;
  const roots = ["src", "prisma", "next.config.ts", "package.json"];

  const newerThanBuild = (target: string): boolean => {
    const stat = fs.statSync(target);
    if (stat.isFile()) return stat.mtimeMs > builtAt;
    return fs.readdirSync(target).some((entry) => newerThanBuild(path.join(target, entry)));
  };

  return roots.some((root) => fs.existsSync(root) && newerThanBuild(root));
}

async function waitForHealth(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) throw new Error(`The test server never became healthy at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the integration suite.");
  }

  const databaseUrl = schemaUrl(HTTP_SCHEMA);
  const env = { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: "1" };

  // Start from nothing, so a crashed previous run cannot leave a half-applied
  // migration behind.
  execFileSync("pnpm", ["prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], {
    input: `DROP SCHEMA IF EXISTS "${HTTP_SCHEMA}" CASCADE;`,
    env: { ...process.env },
    stdio: "pipe",
  });
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
  execFileSync("pnpm", ["db:seed"], { env, stdio: "pipe" });

  if (isBuildStale()) {
    execFileSync("pnpm", ["build"], { env, stdio: "inherit" });
  }

  // `next` is spawned directly rather than through `pnpm start`, so the handle
  // we hold is the server itself and SIGTERM actually reaches it. Going through
  // a package-manager wrapper leaves the real server orphaned on teardown.
  //
  // Its output goes to a file, not to an unread pipe: the app logs a line per
  // request, and a pipe nobody drains fills up and then wedges the server in a
  // blocking write.
  const logPath = path.join(process.cwd(), ".next", "integration-server.log");
  const logFd = fs.openSync(logPath, "w");
  server = spawn(path.join("node_modules", ".bin", "next"), ["start", "--port", String(HTTP_PORT)], {
    env,
    stdio: ["ignore", logFd, logFd],
  });

  await waitForHealth(HTTP_BASE_URL);

  return async () => {
    server?.kill("SIGTERM");
    server = null;
    fs.closeSync(logFd);
  };
}
