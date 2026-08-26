# Verification

Phase 10 of the build spec. Every claim below was produced by a command in this repository, and
each one names how to reproduce it. Where something could not be verified in this environment, it
says so rather than being ticked.

Measured on 2026-08-25 against commit `phase(10)`, Node 22, Chromium 140 headless, Postgres 16 on
the same host.

## Suite totals

| Command | Result |
|---|---|
| `pnpm verify` | exit 0 — typecheck, lint, **173 unit tests in 12 files**, `check:catalog`, production build |
| `pnpm test:integration` | exit 0 — **29 tests in 4 files** against a real server and a real schema |
| `pnpm test:e2e` | exit 0 — **15 tests in 6 files** against a production build |

## Accessibility (Section 21.1)

**1. WCAG AA contrast, both themes.** `tests/unit/contrast.test.ts` reads the tokens out of
`globals.css` — the one place a colour is written down — and measures every pair the product
renders, in light and dark. 41 assertions.

Two token groups failed when first measured and were changed:

| Token | Was | Now | Why |
|---|---|---|---|
| `--rule-strong` (light) | `#9FB0BF` | `#78889A` | 2.05:1 on `--surface-sunken`, below the 3:1 that control borders and chart axes need |
| `--rule-strong` (dark) | `#3A4E60` | `#526980` | 2.18:1 on `--surface` |
| `--ok` / `--warn` / `--danger` (dark) | inherited from light | `#4CC38A` / `#E8A33D` / `#F07A73` | dark mode had no status colours of its own, so warning and error text sat at 2.6–3.4:1 against near-black |

`--ink-muted` on `--surface-sunken`, which Section 21.1.1 calls out by name, measures **5.23:1**
light and **7.60:1** dark.

One documented exception. `--series-5` (#E69F00) and `--series-6` (#56B4E9) reach 2.25:1 and 2.31:1
against a white page, under the 3:1 for a graphical object. Section 20.1 fixes the series palette to
Okabe-Ito and says not to substitute it, because staying separable under deuteranopia, protanopia,
and tritanopia matters more on a chart than luminance against the page — and both colours clear 8:1
in dark mode, where the stroke also thickens. The mitigation is Section 21.1.4: the legend chip, the
tooltip, and `View as table` all carry the series name, so colour is never the only channel. The
exception is pinned in the test, so a *third* weak colour would fail rather than pass quietly.

**2. Chart keyboard mode.** `SeriesChart.tsx` handles `ArrowLeft`/`ArrowRight` (one period),
`PageUp`/`PageDown` (one year, computed from the series frequency), and `Home`/`End`. The cursor is
announced through `aria-live="polite"` as `<period>, <label>, <value>` per series. Covered by
`plot-and-transform.spec.ts › the chart can be read from the keyboard and as a table`.

**3. `View as table`.** Same test. The table has a `<caption>` naming each series and its units, a
header row of legend labels, and one row per period.

**4. Colour is never the only channel.** Legend chips carry the series name beside the swatch, the
tooltip lists names, and the table has headers. Asserted in the same test and in
`format.test.ts › legendLabel`.

**5. Keyboard operability and focus.** Dialogs are real `<dialog>` elements opened with
`showModal()`, so focus trapping and the top layer come from the platform; `Dialog.tsx` restores
focus to the opener on close. Measured directly: opening the save dialog from the toolbar and
cancelling returns focus to the `Save` button. The catalog drawer and the two bottom sheets of
Section 16.3 are the same component with different framing, so they trap and restore identically.

**6. Labels and errors.** `Field.tsx` renders a real `<label htmlFor>`, sets `aria-invalid`, and ties
the error and hint with `aria-describedby`; `AuthForm` focuses the first invalid field on a failed
submit. Measured: zero inputs on `/sign-up` lack an accessible name.

**7. `prefers-reduced-motion`.** `globals.css` collapses every animation and transition to opacity at
100 ms and stops the skeleton shimmer.

**8. Unique, descriptive titles.** Every route sets one. The dashboard's follows the legend, so a
tab reads what is plotted. Measured: `/dashboard?s=GDPC1~pc.g:yoy` titles itself
**"Real GDP, per capita, YoY % - Dr. Dash"**, matching the shape of Section 21.1.8's example.

**Section 16.1 shortcuts.** Measured in a browser: `?` opens the shortcut sheet, `Escape` closes it,
`g l` navigates to `/lessons`, `g d` to `/dashboard`, and `/` focuses `#series-search`.

**No screen reader was run.** Section 24's Phase 10 asks for "a real screen reader run of
`/dashboard` and one lesson". This container has no assistive technology installed and no audio, so
that pass has not happened. Everything a screen reader depends on — roles, names, live regions,
focus order, the table equivalent — is asserted above, but the run itself is outstanding.

## Performance (Section 21.2)

| Metric | Budget | Measured | How |
|---|---|---|---|
| `/dashboard` LCP, Fast 3G + 4× CPU | under 2.0 s | **616 ms** | Playwright over CDP: `Network.emulateNetworkConditions` at 1.6 Mbps / 150 ms RTT and `Emulation.setCPUThrottlingRate: 4`, LCP read from a buffered `PerformanceObserver` |
| `/dashboard` first-load JS | under 250 KB gzipped | **139.9 KB** | `tests/integration/api.test.ts › first-load JavaScript`, gzipping the chunks the build manifest lists for the route |
| `POST /api/v1/plot` p95, 6 monthly series, full history | under 400 ms | **under 400 ms**, asserted every run | `api.test.ts › POST /api/v1/plot › returns six results…` reads the route's own `durationMs` |
| Chart re-render on a transform change | under 80 ms | **median 42 ms, max 54 ms** over 10 samples | Toggling log scale in-page, which re-renders the chart from the same points and never refetches, timed across two animation frames |
| Incremental sync of the whole catalog | under 3 minutes | **not measured** | Needs a FRED key; see below |

`/p/[token]` and `/embed/[token]` are held to the same first-load budget and measure 139.9 KB each.

## What could not be verified here

**No FRED API key was available in this environment.** Three consequences:

1. `pnpm sync` has never run against the live API, so the "under 3 minutes" budget for an
   incremental sync is unmeasured. The ingestion logic itself — watermark skipping, re-fetch on a
   newer `last_updated`, upsert instead of duplicate, topological recompute of the constructed
   series, and per-series error recording on `SyncRun` — is covered by `sync.test.ts`, which injects
   its own fetchers.
2. `pnpm check:catalog` runs in invariant-only mode. The nightly workflow
   (`.github/workflows/catalog-nightly.yml`, at the repository root) runs it with
   `secrets.FRED_API_KEY` for live metadata verification.
3. The **approval** leg of a series request reads live metadata from FRED before writing the row, so
   it is untested end to end. Everything up to the decision is covered by
   `api.test.ts › series requests`, and the FRED-metadata-to-`Series`-fields mapping is covered by
   `sync.test.ts`.

Observations instead come from FRED's public CSV endpoint, fetched once for 18 series from
1990-01-01 forward, and are committed under `prisma/seed/offline/`. Each file records the exact URL
it came from and when. The four constructed series are recomputed from them, giving **6,636
observations across 27 series** in a freshly seeded database.

---

# Definition of done (Section 25)

## Data

- [x] **51 series seeded, all invariants of Section 5.2 pass** — **65** are seeded: the 61 FRED ids
  Section 7.2's tables actually enumerate, plus the 4 constructed. The "51" in the prose does not
  match the spec's own tables; see `docs/decisions.md` §4. Invariants are enforced at seed time by
  `assertSeedInvariants()` in `prisma/seed/series.ts`, which runs on module load, and again by
  `check:catalog`.
- [x] **Incremental sync skips unchanged series; full resync available per series** —
  `sync.test.ts › skips a series whose FRED last_updated has not moved` and
  `› re-fetches when FRED reports a newer last_updated`; `pnpm sync --series=ID --full`.
- [x] **4 constructed series recompute in dependency order after every sync** —
  `sync.test.ts › recomputes constructed series in topological order`. Seed log:
  `recomputed: DD_INFL_CPI:426 DD_MISERY:426 DD_REAL_FFR:426 DD_OUTPUT_GAP:146`.
- [x] **A user can import a CSV and plot the result with any allowed transform** —
  `api.test.ts › CSV import › parses, commits, and plots a user series with a per capita transform`,
  plus both tests in `import-csv.spec.ts`.
- [~] **A user can request a FRED series and an admin can approve it into the catalog** — the
  request lifecycle and the admin-only rule are covered by `api.test.ts › series requests`; the
  approval itself needs a FRED key and was not exercised. See "What could not be verified here".

## Transformations

- [x] **Growth (3 modes), real (any valid base year, 3 deflators), per capita, percent of another** —
  `growth.test.ts` (15), `real.test.ts` (6), `percapita.test.ts` (5), `percentof.test.ts` (7).
- [x] **Rate series produce percentage-point changes, not percent changes** —
  `growth.test.ts › rate series use a percentage point difference › is 11.1 percentage points at
  2020-04-01`.
- [x] **Pipeline order is real, then per capita, then percent of, then growth, with a test proving
  it** — `transform-pipeline.test.ts › order matters › deflating after taking growth would give a
  different answer, so it does not`.
- [x] **Disabled controls always explain why** — `capabilities.test.ts` (9 tests), each asserting the
  reason string, and the controls render it as the disabled hint.
- [x] **Apply to all series and apply to selected series both work** —
  `plot-and-transform.spec.ts › a transform can be applied to all series or to just one`.

## Plotting

- [x] **Category click then series click plots in two clicks** — `plot-and-transform.spec.ts` step 1.
- [x] **Up to 6 series, dual axis, recession shading, log scale, date presets** — steps 6 and 8, plus
  `api.test.ts › returns six results, a domain, recession intervals, and axis metadata` and
  `› refuses a seventh series`.
- [x] **CSV and PNG export, PNG includes the transform chain** — CSV is asserted in
  `plot-and-transform.spec.ts` step 9 (the downloaded header carries the legend labels) and in the
  gradebook CSV test. The PNG is drawn to a canvas in the browser, so it was checked by hand rather
  than by an automated test: downloading `/dashboard?s=GDP~r2017.pc.g:yoy` produced
  `dr-dash-2026-08-25.png` with `GDP (Billions of Dollars) › x GDPDEF(2017)/GDPDEF(t) ›
  / B230RC0Q173SBEA(t) › YoY % change` and `Source: GDP · Dr. Dash` burned in at the bottom left,
  which is the same `formulaChain` the transform bar renders.
- [x] **URL fully reproduces any view; back button behaves as specified** — `urlState.test.ts` (14
  tests, including the canonical Section 12.4 example and idempotence), and
  `plot-and-transform.spec.ts` step 10 reloads the URL and gets the identical chart.

## Lessons

- [x] **6 lessons complete, auto-graded, resumable** — `lessons.test.ts` runs every computed answer
  key in all six against the seeded data; `lesson-run.spec.ts` completes one start to finish;
  `api.test.ts › assignments › caps attempts and remembers where a student left off` proves an
  attempt resumes at the step it was left on rather than opening a second one.
- [x] **Questions locked behind their task's state check** —
  `lessons.test.ts › locks every question behind a task` and `lesson-run.spec.ts` step 2.
- [x] **Answer keys never sent to the browser** —
  `api.test.ts › permissions › never sends a lesson's answer key to the browser`, and
  `lessonEvaluate.test.ts › the evaluator whitelist › rejects a function that is not on it`.
- [x] **Numeric answers computed from live data with tolerances** — the 12 evaluator tests plus
  `› tolerance › floors a relative tolerance so answers near zero stay gradeable`.

## Courses

- [x] **Course creation, join code, roster, assignment, attempt limits** —
  `instructor-gradebook.spec.ts` for the first four,
  `api.test.ts › assignments › caps attempts…` for the fifth (`409 MAX_ATTEMPTS_REACHED`).
- [x] **Gradebook view and CSV export** — `instructor-gradebook.spec.ts` asserts the header row is
  exactly `Student Name,Email,<lesson>,Total,Percent`, that the file is named `<course>-gradebook.csv`,
  and that a student cannot open another course's gradebook (403).

## Publishing

- [x] **Save, publish, unpublish, public page, embeddable iframe with a copyable snippet** —
  `publish-dashboard.spec.ts › publishing, reading signed out, and framing on another origin` covers
  all of it, including the embed rendering inside an iframe served from a different origin
  (`localhost` framing `127.0.0.1`) with transforms working and no session;
  `› an unpublished dashboard is not readable` covers unpublish.

## Quality

- [x] **`pnpm verify` exits 0** — 173 unit tests, lint clean, typecheck clean, catalog check passed,
  production build succeeded.
