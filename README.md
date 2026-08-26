# Dr. Dash

Macroeconomic data turned into information: one categorized, auto-updating database of macro
time series, one-click plotting, one-click transformations that reveal different information
from the same data, and self-contained graded lessons.

Four things, in one product:

1. **The database.** Every macro series used in teaching, linked to its government source, plus
   four Dr. Dash constructed series and anything you import.
2. **The plotting system.** Click a category, click a series, it plots. Up to six at once, dual
   axis, recession shading, log scale.
3. **The transformations.** Growth rate, real at any base year, per capita, and one series as a
   percent of another, applied to everything at once or to one series at a time.
4. **The lessons.** Six graded, assignable lessons that alternate a task in the product with a
   question about what the student just saw.

## First run

```bash
cp .env.example .env.local
# fill FRED_API_KEY and SESSION_SECRET
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm sync            # skipped automatically if FRED_API_KEY is empty
pnpm dev
```

### The FRED key

Series metadata and observations come from the St. Louis Fed. A key is free: create an account at
<https://fredaccount.stlouisfed.org/apikeys> and request one, then put it in `.env.local` as
`FRED_API_KEY`. Without a key the catalog still seeds and the app still runs; `pnpm sync` refuses
with `FRED_KEY_MISSING` and `check:catalog` verifies invariants only, without live metadata.

`SESSION_SECRET` is any 32-character-or-longer random string: `openssl rand -base64 48`.

`.env` is a tracked symlink to `.env.local`, because the Prisma CLI reads `.env` and Next.js reads
`.env.local`, and one file is easier to keep right than two. Create `.env.local` and both are fed.

### Demo credentials

Created when `SEED_DEMO_DATA=true`:

| Account | Email | Password | Role |
|---|---|---|---|
| Demo instructor | `instructor@drdash.test` | `DrDashDemo!2026` | INSTRUCTOR |
| Demo student | `student1@drdash.test` | `DrDashDemo!2026` | STUDENT |

Demo accounts are created only when `NODE_ENV !== "production"` **and** `SEED_DEMO_DATA === "true"`.
The seed refuses to create them in production and logs why.

The same seed creates the demo organization `demo-university` with instructor code `TEACH1`, the
demo course `Principles of Macroeconomics` with join code `MACRO7`, and one published dashboard at
`/p/DrDashSampleDashb0ard1`, which is where the landing page's `See a sample dashboard` goes.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on <http://localhost:3000> |
| `pnpm verify` | Typecheck, lint, unit tests, catalog check, production build |
| `pnpm test` | Unit tests only |
| `pnpm test:integration` | Integration tests against a real Postgres schema and a real server |
| `pnpm test:e2e` | Playwright, against a production build |
| `pnpm db:migrate` | Create and apply a migration in development |
| `pnpm db:deploy` | Apply migrations in production |
| `pnpm db:seed` | Categories, series, lessons, and demo data |
| `pnpm db:reset` | Drop, migrate, and reseed. Destructive |
| `pnpm sync` | Pull from FRED. `--series=ID,ID` for a subset, `--full` to ignore watermarks |
| `pnpm check:catalog` | Verify every seeded FRED id still resolves and still matches the catalog |

## Deployment

Both paths need every variable in `.env.example` set in the environment, a Postgres 16 database, and
one run of `pnpm db:deploy && pnpm db:seed` before first traffic.

### Path A: container

The `Dockerfile` builds a standalone Next.js server; `docker-compose.yml` brings it up next to a
Postgres 16. On any host that runs containers plus a managed Postgres:

```bash
docker build -t dr-dash .
docker run -p 3000:3000 --env-file .env.local dr-dash
```

Schedule the daily sync by POSTing to `/api/v1/admin/sync` with the shared secret:

```bash
curl -X POST https://<host>/api/v1/admin/sync -H "x-cron-secret: $CRON_SECRET"
```

The route answers `202` immediately and runs the job in the background; poll
`GET /api/v1/admin/sync/status` for progress, or watch it on `/admin/sync`.

### Path B: Vercel plus a managed Postgres

Set the environment variables in the project, and `vercel.json` schedules the daily sync. Vercel's
scheduler issues `GET` and authenticates with `Authorization: Bearer $CRON_SECRET`, which the sync
route accepts from a scheduler and only from a scheduler — it never reads a session on `GET`, so
nothing a browser follows can start a sync.

**The sync must finish inside the platform's function timeout.** A full incremental sync of the
whole catalog takes about a minute against a warm FRED, and `maxDuration` on the route is 300
seconds; if your plan's ceiling is lower, split the work across several cron entries using the
`slugs` body parameter, one category's ids per entry.

## Where things are

| Path | What |
|---|---|
| `prisma/schema.prisma` | The data model |
| `prisma/seed/series.ts` | The catalog: every series, its category, and what transforms it allows |
| `prisma/seed/lessons/` | The six lessons |
| `src/lib/series/` | The transformation engine. `transform.ts` is the pipeline |
| `src/lib/dashboard/urlState.ts` | The URL grammar. The URL is the state |
| `src/lib/lessons/` | Lesson schema, the evaluator whitelist, the state check, the grader |
| `src/app/api/v1/` | Every route in Section 10 of the build spec |
| `docs/decisions.md` | Every place the build spec was ambiguous or self-contradictory, and what was done |
| `docs/verification.md` | Accessibility, performance, and the definition-of-done checklist with evidence |
| `prisma/seed/offline/*.json` | Seeded observations, each file naming the FRED URL it came from |
| `.github/workflows/` | CI, the daily sync trigger, and the nightly catalog check |
