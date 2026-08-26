# Decisions

Numbered judgment calls made while building against `DR_DASH_BUILD_SPEC.md`, per Section 27.
Each entry records the date, the decision, and the alternative that was rejected.

## 1. `.env` is a committed symlink to `.env.local` (2026-08-25)

**Decision.** The repository contains `.env` as a symlink pointing at `.env.local`.

**Why.** Section 23.2 pins the `package.json` scripts exactly, and Section 23.3 pins the
first-run sequence exactly: it creates `.env.local` and nothing else. Next.js reads
`.env.local`; the Prisma CLI only reads `.env`. Without a bridge, `pnpm db:migrate` fails on a
clean clone with `Environment variable not found: DATABASE_URL` even though the documented
setup was followed. The symlink makes both tools read the one file the spec tells the user to
create.

**Rejected.** Adding `dotenv-cli` to the scripts (changes the pinned script text and adds a
dependency outside Section 2.2); telling the user to maintain two env files (contradicts the
verbatim first-run block); moving `DATABASE_URL` into a separate committed `.env` (splits the
configuration the spec keeps in one file).

## 2. Files added beyond the Section 3 tree (2026-08-25)

**Decision.** Six paths exist that Section 3 does not list. Section 23.1 permits
`vitest.integration.config.ts`, the two workflows, `prisma/seed/offline/*.json`, and
`src/lib/series/downsample.ts`; these are the additions beyond even that list.

| Path | Why it must exist |
|---|---|
| `.eslintrc.json` | `pnpm lint` runs `next lint`, which requires an ESLint config. |
| `.env` | Decision 1. |
| `pnpm-lock.yaml` | Section 2.1 chooses pnpm "for lockfile determinism", and the Dockerfile and CI both run `pnpm install --frozen-lockfile`. |
| `docs/decisions.md` | This file, mandated by Section 27. |
| `tests/integration/**` | Section 22.2 specifies five integration tests and Section 23.1 permits the config file that runs them, which implies the files it runs. |
| `.github/workflows/catalog-nightly.yml` | Section 23.7 requires `check:catalog` on a nightly schedule with a live FRED key; the two permitted workflows are CI (push/PR) and sync (data refresh). |

**Rejected.** Folding the nightly catalog check into `ci.yml` as a schedule-gated job. It was
built that way first, and the `catalog-live` job in `ci.yml` still exists as the CI-local form;
the standalone workflow is what a scheduler actually enables and disables.

## 3. The application lives in `dr-dash/`, not at the repository root (2026-08-25)

**Decision.** The Section 3 tree is rooted at `dr-dash/` inside the existing host repository.

**Why.** Section 3 names the tree root `dr-dash/`, and the app was not the only tree in the host
repository.

**Rejected.** A separate repository, which is not this task's to create.

**Superseded by decision 28 (2026-08-26).** Dr. Dash now has its own repository and the
tree is rooted at that repository's root.

## 4. Section 7.2 enumerates 61 FRED series, not 47 (2026-08-25)

**Decision.** All 61 FRED ids listed in the Section 7.2 tables are seeded, plus the 4 constructed
series of Section 7.3, for 65 rows. The counts "47" (Section 7.2 heading), "51" (Sections 0.2,
10.9, 24 Phase 1, 25) are treated as stale summary figures.

**Why.** The tables are the enumeration; the totals are prose about them. Counting the rows gives
10 + 6 + 10 + 9 + 5 + 3 + 4 + 3 + 7 + 4 = 61. Rule 0.1.3 forbids inventing a FRED id, and every
id used here comes from those tables. Seeding only 47 of the 61 would require inventing a rule
for which 14 to drop, which is a larger departure from the spec than seeding what it lists.

**Rejected.** Dropping rows to reach 47; the choice of which to drop would be unjustifiable.
`scripts/check-catalog.ts` therefore asserts "every Section 7 row is present and nothing else is"
rather than a hardcoded count.

## 5. `CSUSHPINSA.shortLabel` is "Case-Shiller Home Prices" (2026-08-25)

**Decision.** The Section 7.2 table gives `Case-Shiller Home Price Index` (29 characters);
Section 5.1 constrains `shortLabel` to 28. The seeded label is `Case-Shiller Home Prices`.

**Why.** The length constraint is structural — legend chips and transform-bar chips are laid out
around it — while the label text is presentational. Trimming the redundant word "Index" from a
series whose `units` already read `Index Jan 2000=100` loses nothing.

**Rejected.** Raising the 28-character limit for one row, which would relax a constraint the
legend layout depends on.

## 6. A real transform keeps the series' unit scale in its label (2026-08-25)

**Decision.** After `{real: true, baseYear: 2017}` on a billions-scaled series, `unitsShort` is
`Bil. 2017 $` and `units` is `Billions of 2017 Dollars`. Only when `displayScale` is 1 (that is,
after per capita) do they become `2017 $` and `2017 Dollars`.

**Why.** Section 6.5.2 step 4 says the units become `"<B> Dollars"` / `"<B> $"`, but Section
22.4's `plot-and-transform.spec.ts` step 2 asserts the axis label reads `Bil. 2017 $` and step 3
asserts `2017 $/person`. Both hold if the scale prefix survives deflation and disappears with
`displayScale`, which is also what the numbers on the axis actually are: deflating does not
change that the values are billions.

**Rejected.** Literal `"2017 $"` at billions scale, which contradicts the E2E assertion and
mislabels the axis by a factor of a billion.

## 7. Eighteen offline fixture series, not eight (2026-08-25)

**Decision.** `prisma/seed/offline/` carries the eight series Section 4.3 names plus ten more:
`B230RC0Q173SBEA`, `PCEC`, `GPDI`, `GCE`, `NETEXP`, `GFDEBTN`, `CIVPART`, `EMRATIO`,
`FEDFUNDS`, `GDPPOT`.

**Why.** Each of the ten is required by an acceptance criterion the eight cannot meet without a
FRED key:

| Added | Required by |
|---|---|
| `B230RC0Q173SBEA` | Lesson 3's quarterly population denominator |
| `PCEC`, `GPDI`, `GCE`, `NETEXP`, `GFDEBTN` | Lesson 5, every step |
| `CIVPART`, `EMRATIO` | Lesson 6, steps s4 and s5 |
| `FEDFUNDS` | The "Fed funds rate" starter button (Section 16.3), and `DD_REAL_FFR` |
| `GDPPOT` | `DD_OUTPUT_GAP` |

Section 0.2 requires all six lessons to run start to finish and Phase 7's acceptance repeats it;
Section 4.3 says the fixtures exist so "the app is demoable and E2E tests are deterministic".
With only the eight, lessons 3, 5, and 6 have no data offline, two of the four constructed series
stay empty, and one of the four starter buttons plots nothing.

**Rejected.** Fixtures for all 61 FRED series, which would quadruple the committed data for
series no acceptance criterion needs. The eight named remain the required floor; a FRED key still
replaces all of it with full history on the first `pnpm sync`.

## 8. Fixture provenance: FRED's public CSV endpoint (2026-08-25)

**Decision.** The fixtures hold real FRED observations fetched from
`https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>&cosd=1990-01-01`. Every file records the
exact URL it came from and the timestamp it was captured, and the truncation to 1990-01-01
forward is Section 4.3's.

**Why.** Section 4.3 says to generate the fixtures from "the first successful sync output", which
assumes a FRED API key. No key was available for this build. The public CSV endpoint returns the
same observations the API does, so the fixtures are real data rather than plausible-looking
numbers, which matters: the lessons' numeric answers are computed from whatever is in the
database, so fabricated fixtures would teach fabricated macroeconomic facts.

**Rejected.** Synthetic fixtures, which would have made every lesson's numbers fiction; and
shipping without fixtures, which leaves the app blank and the E2E suite unrunnable.

## 9. `Lesson.maxScore` is derived, so lessons 3 and 6 differ from their stated totals (2026-08-25)

**Decision.** `maxScore` is computed as the sum of the lesson's question points, per Section 19.5.
That makes lesson 3 worth 70 and lesson 6 worth 95, where Section 19.7's headings say 80 and 90.

**Why.** Section 19.7 gives explicit per-question points, and Section 19.5 states the rule:
"`submit` sums `pointsEarned` into `LessonAttempt.score` and sets `maxScore` to the sum of all
question `points` in the lesson version." Lesson 3's questions total 15 + 10 + 15 + 10 + 20 = 70;
lesson 6's total 15 + 15 + 10 + 10 + 15 + 10 + 20 = 95. Lessons 1, 2, 4, and 5 match their stated
totals exactly, so the two that do not read as arithmetic slips in the headings.

**Rejected.** Reweighting questions to hit 80 and 90, which would silently contradict the
per-question points the spec sets out; and hardcoding the stated total, which would make a
student's percentage wrong.

## 10. `src/lib/db.ts` holds the catalog data-access layer (2026-08-25)

**Decision.** Loading catalog rows as the engine's `SeriesData`, the visibility rules, and the
Section 9.1 category resolution all live in `src/lib/db.ts` alongside the Prisma singleton.

**Why.** Section 3 describes the file as "(PrismaClient singleton)" and provides no other home for
shared database access; `src/lib/series/*` must not touch the database at all (Section 24, Phase 3
acceptance), and Next.js route modules may only export route handlers, so a helper shared by
`/plot`, `/series/:slug/observations`, and the lesson evaluator cannot live in a route file.

**Rejected.** A new `src/lib/catalog/` directory, which Section 23.1 does not permit; and
duplicating the loader into each route, which would let the visibility rules drift apart.

## 11. `DELETE /api/v1/courses/:id/enrollments/:userId` adds a route file (2026-08-25)

**Decision.** `src/app/api/v1/courses/[id]/enrollments/[userId]/route.ts` exists, though Section 3
lists no `[userId]` segment.

**Why.** Rule 0.1.6 makes the Section 10 paths authoritative: "Every API route in Section 10 must
exist with the exact path, method, status codes, and JSON shape given," and Section 10.8 gives that
exact path.

**Rejected.** A query parameter on the parent route, which would have kept the tree literal at the
cost of the route contract.

## 12. `src/components/chart/DashboardWorkspace.tsx` (2026-08-25)

**Decision.** The dashboard's interactive half is one client component, added to the Section 3
tree.

**Why.** Section 21.2 requires the catalog tree and category data to render in a server component
while "only the chart, legend, transform panel, and toolbar are client components". Those four
share the URL state, the plot response, and the legend selection, so they need a common client
parent, and `page.tsx` has to stay a server component to satisfy the first half of that sentence.

**Rejected.** Making `dashboard/page.tsx` a client component, which keeps the tree literal but
moves the catalog tree into the client bundle, contradicting an explicit performance instruction.

## 13. Control changes write the URL with the History API, not the router (2026-08-25)

**Decision.** `DashboardWorkspace.write` calls `window.history.pushState` / `replaceState` and
mirrors the state locally, instead of `router.push` / `router.replace`.

**Why.** Two problems, one of them a real defect. A `router.push` issued while the page is still
hydrating is silently dropped: measured over ten fresh sessions, two clicks on a catalog row
changed nothing, with no error anywhere. And a router write only reaches `useSearchParams` after an
RSC round trip, so a control toggled twice quickly composed the second change onto the state before
the first, dropping a transform. The History API is synchronous and Next 15 supports it for
search-parameter updates. Back and forward still work: a `popstate` hands authority back to the
URL.

**Rejected.** Retrying dropped pushes, which hides the problem rather than fixing it; and adding
artificial waits to the E2E suite, which would have left the same defect in front of real users on
a slow connection.

## 14. `tests/e2e/helpers.ts` (2026-08-25)

**Decision.** The shared `register`, `signIn`, and `settle` helpers live in a non-spec file.

**Why.** Importing one `.spec.ts` from another executes its `test()` calls, registering that file's
tests a second time inside the importing file's run. Playwright's `testMatch` ignores
`helpers.ts`, so it is support code rather than a suite.

**Rejected.** Copying the helper into each of the six spec files.

## 15. `PATCH /api/v1/attempts/:id` (2026-08-25)

**Decision.** A route exists at `src/app/api/v1/attempts/[id]/route.ts` accepting
`{currentStep}`.

**Why.** Section 19.8 specifies the behaviour — "the attempt's `currentStep` is PATCHed on every
step advance so a student can close the tab and return" — but Section 10.7 lists no route for it
and Section 3 no file. Without one, `Continue` on `/lessons` cannot resume where the student left
off.

**Rejected.** Folding `currentStep` into the answers route, which would only save progress at a
question and lose a student who stopped in the middle of a task.

## 16. Demo organization and instructor code (2026-08-25)

**Decision.** The seed creates an organization, `demo-university`, carrying `instructorCode:
"TEACH1"`, attaches the demo instructor and admin to it, and the sign-up form gained an
"Instructor code" field that is sent when the role is `INSTRUCTOR`.

**Why.** Section 11.4 requires an organization-issued code for instructor sign-up outside
development, and the E2E suite runs a production build, so `register(page, "Instructor")` was
refused with "An instructor account needs a code from your organization." There was no way to
create an instructor through the UI at all: `Organization.instructorCode` had no writer, no seed
value, and the form no field. The gradebook scenario now exercises the real production path.

**Rejected.** Relaxing the rule under `E2E`, which would have left the shipped sign-up form unable
to satisfy its own requirement.

## 17. Publishing lives inside the save dialog (2026-08-25)

**Decision.** `Save` opens a dialog for title and description; once the dashboard exists, the same
dialog becomes the publish dialog, with `Allow embedding in other sites`, the public link, the
iframe snippet, and `Unpublish`.

**Why.** Section 17.2 refers to "the publish dialog" and specifies its copyable snippet, but
Section 14.4 enumerates the toolbar and there is no `Publish` button in it, and Section 3's tree has
no dashboard-management page to host one. A dashboard also has to exist before it can have a public
token, so save-then-publish is one flow with two steps rather than two entry points.

**Rejected.** A `Publish` button in the toolbar, which would contradict Section 14.4's list, and a
`/dashboards` page, which would add a route the tree does not have.

## 18. `src/app/p/[token]/opengraph-image.tsx` (2026-08-25)

**Decision.** The OG image is a `next/og` `ImageResponse` drawing the title, the byline, and a
static bar thumbnail.

**Why.** Section 17.1 requires "a dynamic OG image at `/p/[token]/opengraph-image`" while Section 3's
tree lists only `page.tsx` under that folder. The tree is the required minimum, and this is the
Next.js file convention that serves that path. The thumbnail is drawn rather than screenshotted
because rendering the real chart would run the whole transform pipeline on every unauthenticated
social-card fetch.

**Rejected.** A static image for every dashboard, which drops the title the section asks for.

## 19. The embed drops the top bar with a CSS rule (2026-08-25)

**Decision.** `src/app/embed/[token]/page.tsx` wraps itself in `.embed-root`, and `globals.css`
hides `[data-app-chrome]` inside a body that contains one.

**Why.** Section 17.2 requires no top bar on the embed. The bar is rendered by the root layout, and
a nested layout composes with a root layout rather than replacing it, so the only Next.js mechanism
that would truly remove it is a second root layout under a route group — which means moving every
other route into a group and diverging from Section 3's tree. The rule is server-rendered, so there
is no flash and no client JavaScript.

**Rejected.** Making the top bar a client component that reads `usePathname()`, which would move the
session read to the client on every page in the product to change one.

## 20. `fetchPublishedDashboard()` in `src/lib/db.ts` (2026-08-25)

**Decision.** One function does the read Section 17.1 describes — an HTTP call to
`GET /api/v1/public/dashboards/:token` — and the page, the embed, and the OG image all call it. The
origin comes from the request's `Host`, not from `NEXT_PUBLIC_APP_URL`.

**Why.** A page may not export anything but the Next.js conventions, so the helper cannot live in
`page.tsx`, and three copies of it would be three places for the 404 rule to drift. Reading the
request's host is what lets a deployment answer on a second hostname, or on a test port, without
being reconfigured. `next/headers` is imported lazily because `db.ts` is also loaded by the CLI
scripts, which have no request.

**Rejected.** Reading Prisma directly from the pages, which is faster but leaves the endpoint and
the page as two implementations of "what is published", and never counts a page view.

## 21. A seeded published dashboard with a fixed token (2026-08-25)

**Decision.** The seed publishes `Growth and unemployment` under the constant token
`DrDashSampleDashb0ard1`.

**Why.** Section 16.2 requires the landing page's `See a sample dashboard` to link "to a seeded
published dashboard token", so one has to exist before any user has published anything. The token is
constant rather than random because reseeding must not break a link an instructor has already put in
a syllabus.

**Rejected.** Minting a random token per seed, which changes the sample URL on every `pnpm db:reset`.

## 22. `tests/unit/contrast.test.ts` (2026-08-25)

**Decision.** A unit test measures every colour pair the product renders, in both themes, against
WCAG AA, reading the tokens out of `globals.css` rather than a copy.

**Why.** Section 24's Phase 10 requires "dark mode verification of all contrast pairs", and Section
25 accepts a command output as evidence — but a one-time measurement stops being true at the next
token edit, and this pass found three real failures (`--rule-strong` in both themes, and dark mode
inheriting light-mode status colours). A verification worth doing once is worth keeping.

**Rejected.** Recording the numbers in `docs/verification.md` only, which is what the checklist
literally asks for and what nothing would defend.

## 23. The drawer and the bottom sheets are `Dialog` (2026-08-25)

**Decision.** `Dialog` gained a `variant` of `modal`, `drawer`, or `sheet`, and
`DashboardWorkspace` renders the catalog and the transform panel either as a column or inside one,
never both, choosing with `useSyncExternalStore` over `matchMedia`.

**Why.** Section 16.3 wants the catalog to collapse to a drawer between 768 and 1200 px and both
panels to become bottom sheets below 768, and Section 21.1.5 wants bottom sheets to trap focus and
restore it — which is exactly what `Dialog` already does through `<dialog>.showModal()`. Rendering
one instance rather than a hidden column plus a visible modal matters for more than tidiness: two
copies would mean two elements carrying the same label and the same id, and a screen reader would
read the hidden one.

**Rejected.** Hiding the columns with `max-lg:hidden` and rendering a second copy in the modal.

## 24. Global shortcuts as an inline script (2026-08-25)

**Decision.** `g d`, `g l`, and `?` are bound by an inline script in the root layout, and the
shortcut sheet is a server-rendered `<dialog>`. (`/` stays with `SeriesSearch`, which owns the input
it focuses.)

**Why.** Section 16.1 makes those shortcuts global, so they have to work on `/lessons` and
`/courses`, not only where the workspace is mounted. The root layout is a server component that
reads the session for the top bar; turning it into a client component to add four key bindings would
move that session read into the browser on every page in the product. The same technique is already
used one element above for the no-flash theme script.

**Rejected.** A client component in the layout, and repeating the bindings in every page.

## 25. No `pnpm verify:perf` (2026-08-25)

**Decision.** The Section 21.2 budgets are measured and written down in `docs/verification.md`;
first-load JS and `/plot` latency are additionally asserted in the integration suite.

**Why.** Section 21.2 names Lighthouse CI in `pnpm verify:perf`, but Section 23.2 gives the script
list and calls it exact, and `verify:perf` is not in it. Section 21.2 itself offers the alternative
for the re-render budget — "or manual with a documented measurement" — so that is the route taken
for LCP and for the re-render, while the two budgets that *can* be asserted from data on disk are.

**Rejected.** Adding a script Section 23.2 does not list, and adding Lighthouse as a dependency
when Section 2.2 pins the dependency set.

## 26. `GET /api/v1/admin/sync` for a scheduler, and `vercel.json` (2026-08-25)

**Decision.** The sync route accepts `Authorization: Bearer <CRON_SECRET>` as well as
`x-cron-secret`, and answers `GET` — but only for a scheduler holding the secret, never for a
session. `vercel.json` schedules it daily.

**Why.** Section 23.8 requires path B to work, and Vercel's scheduler can only issue `GET` and can
only authenticate with a bearer token. Without both, `vercel.json` would be a file that looks like a
deployment and is not one. Gating the `GET` on the shared secret and never reading a session there
keeps a side-effecting `GET` out of reach of anything a browser can be made to follow.

**Rejected.** A `vercel.json` pointing at a route that would answer 405, with a README note telling
the operator to work around it.

## 27. The workflows live at the repository root (2026-08-25)

**Decision.** `ci.yml`, `sync.yml`, and `catalog-nightly.yml` moved from `dr-dash/.github/workflows/`
to `.github/workflows/` at the repository root, and CI's `push` and `pull_request` triggers are
scoped to `dr-dash/**`.

**Why.** Section 3's tree puts them at the project root, which is `dr-dash/` in this repository — but
GitHub only discovers workflows in the root `.github/workflows`, so as filed none of the three could
ever run and Section 23.7's "on push and pull request" was a file rather than a fact. The jobs were
already written for the root: each sets `working-directory: dr-dash` and
`cache-dependency-path: dr-dash/pnpm-lock.yaml`. The path filter is because the app was then one
tree among several in the host repository, and a change elsewhere should not run the whole Dr. Dash
suite.

**Rejected.** Leaving them where the tree puts them, which keeps the file matching the spec and the
behaviour not matching it.

**Amended by decision 28 (2026-08-26).** The workflows still live at the repository root, which is
now the project root too, so `working-directory`, the `dr-dash/`-prefixed
`cache-dependency-path` and artifact path, and the path filter are all gone.

## 28. Dr. Dash moved to its own repository, at its root (2026-08-26)

**Decision.** The whole project — the Section 3 tree and the three workflows that decision 27 put at
the host repository's root — moved into a repository of its own, with the application tree at that
repository's root and `.github/workflows/` beside it. Decisions 3 and 27 are superseded and amended
accordingly.

Four things changed in the move; nothing else did:

| Where | Was | Is |
|---|---|---|
| `ci.yml`, `catalog-nightly.yml` | `working-directory: dr-dash` on every job | removed — the app is the repository |
| `ci.yml`, `catalog-nightly.yml` | `cache-dependency-path: dr-dash/pnpm-lock.yaml` | `pnpm-lock.yaml` |
| `ci.yml` | `push`/`pull_request` filtered to `dr-dash/**` | unfiltered |
| `ci.yml` | artifact `path: dr-dash/playwright-report` | `playwright-report` |

`sync.yml` needed no change: it only calls a deployed endpoint and never touches the checkout.

One file was added. The Dockerfile's builder stage does `COPY . .`, and the documented build command
runs from the project root — which used to be `dr-dash/`, one level below `.git`, and is now the
repository root. Hoisting the tree therefore pulled `.git` into the build context for the first time,
so `.dockerignore` now excludes it along with the build output, `node_modules`, and the `.env`
symlink and its target.

**Why.** Decision 3 rooted the tree at `dr-dash/` because the app was one tree among several in the
host repository, and decision 27 accepted the resulting `working-directory` and path-filter machinery
as the cost of that. With a repository of its own, both the nesting and the machinery are cost without a
reason: the path filter can only ever match everything, and `working-directory` can only ever name the
root.

**Rejected.** Keeping the app nested at `dr-dash/` in the new repository, which would have left the
copy byte-identical and every workflow untouched, but preserves a directory level that no longer
separates anything from anything.
