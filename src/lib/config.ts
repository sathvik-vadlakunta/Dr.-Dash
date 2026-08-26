import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The one place `process.env` is read (Section 4.2). Everything else imports
 * `config` from here. `next.config.ts` and files under `scripts/` are the only
 * permitted exceptions.
 */

/**
 * Minimal dotenv loader. Next.js loads `.env.local` for `next dev`/`next build`
 * on its own, but the `tsx` scripts (seed, sync, check:catalog) do not go
 * through Next, so they need the same file. Values already present in the real
 * environment always win.
 */
function loadEnvFiles(): void {
  const root = process.cwd();
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
      if (key === "" || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const positiveIntFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().positive());

const schema = z.object({
  DATABASE_URL: z
    .string({ required_error: "required" })
    .min(1, "must not be empty")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "must be a postgresql:// connection string",
    }),
  /** Empty is legal and switches the app into offline-fixture mode (Section 4.3). */
  FRED_API_KEY: z.string().optional().default(""),
  SESSION_SECRET: z
    .string({ required_error: "required" })
    .min(32, "must be at least 32 characters (openssl rand -base64 48)"),
  CRON_SECRET: z.string().optional().default(""),
  NEXT_PUBLIC_APP_URL: z.string().url("must be an absolute URL").default("http://localhost:3000"),
  SEED_DEMO_DATA: booleanish,
  FRED_MAX_REQUESTS_PER_MINUTE: positiveIntFromString(110),
  FRED_REQUEST_TIMEOUT_MS: positiveIntFromString(20_000),
  SYNC_CONCURRENCY: positiveIntFromString(4),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof schema> & {
  isProduction: boolean;
  isDevelopment: boolean;
  hasFredKey: boolean;
};

function parseConfig(): AppConfig {
  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    FRED_API_KEY: process.env.FRED_API_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA,
    FRED_MAX_REQUESTS_PER_MINUTE: process.env.FRED_MAX_REQUESTS_PER_MINUTE,
    FRED_REQUEST_TIMEOUT_MS: process.env.FRED_REQUEST_TIMEOUT_MS,
    SYNC_CONCURRENCY: process.env.SYNC_CONCURRENCY,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(
      [
        "Environment is not configured. Fix these variables in .env.local:",
        ...lines,
        "",
        "Start from .env.example: cp .env.example .env.local",
      ].join("\n"),
    );
  }

  const env = parsed.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    hasFredKey: env.FRED_API_KEY.trim().length > 0,
  };
}

export const config: AppConfig = parseConfig();
