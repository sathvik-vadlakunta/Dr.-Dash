import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loadSeriesBySlugs, makeSeriesLoader, prisma } from "@/lib/db";
import { applyTransform } from "@/lib/series/transform";
import { emptyTransform } from "@/lib/series/types";
import { seriesColor } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Macroeconomic data, plotted and transformed",
};

/**
 * Section 16.2. Signed-in users never see this page. Signed-out visitors get
 * the thesis, a live chart rendered on the server from real seeded data, the
 * four components, and two calls to action.
 */
export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const spark = await realGdpPerCapitaGrowth();
  const sample = await prisma.dashboard.findFirst({
    where: { isPublic: true, publicToken: { not: null } },
    select: { publicToken: true },
  });

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-8 px-4 py-16">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-display-l">Dr. Dash</h1>
        <p className="text-body text-ink">
          Dr. Dash turns macroeconomic data into information by giving instructors a single,
          categorized, auto-updating database of macro time series, one-click plotting, one-click
          transformations that reveal different information from the same data, and self-contained
          graded lessons that build a student&rsquo;s ability to extract information from data.
        </p>
      </section>

      <section aria-label="Real GDP per capita growth" className="flex flex-col gap-2">
        <span className="eyebrow">Real GDP per capita, year over year</span>
        {spark ? (
          <>
            <Sparkline points={spark.values} />
            <p className="font-mono text-data text-ink-muted">
              {spark.firstDate} to {spark.lastDate} · latest {spark.latest.toFixed(1)}%
            </p>
          </>
        ) : (
          <p className="text-small text-ink-muted">
            Seed the database to see this chart. See the README for the first-run sequence.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title">What it is</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-ink">
          <li>
            <strong>The database.</strong> Every macro series used in teaching, linked to the
            government sources, plus Dr. Dash constructed series and your own imports.
          </li>
          <li>
            <strong>The plotting system.</strong> Click a category, click a series, it plots.
            Overlay up to six, dual axis, recession shading.
          </li>
          <li>
            <strong>The transformations.</strong> Growth rate, per capita, real at any base year,
            and one series as a percent of another, applied to everything at once or one at a time.
          </li>
          <li>
            <strong>The lessons.</strong> Self-contained and assignable, alternating a task in Dr.
            Dash with a graded question about what you just saw.
          </li>
        </ol>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/sign-up"
          className="inline-flex h-[36px] items-center rounded-control bg-accent px-4 text-small font-medium text-accent-ink"
        >
          Create an account
        </Link>
        {sample?.publicToken ? (
          <Link
            href={`/p/${sample.publicToken}`}
            className="inline-flex h-[36px] items-center rounded-control border border-rule-strong px-4 text-small font-medium text-ink"
          >
            See a sample dashboard
          </Link>
        ) : null}
      </section>
    </main>
  );
}

/** A non-interactive server-rendered sparkline; no client JavaScript at all. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const width = 640;
  const height = 120;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;

  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY = height - ((0 - min) / span) * height;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Real GDP per capita growth over the seeded history"
      className="border border-rule"
    >
      <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="var(--rule-strong)" />
      <path d={path} fill="none" stroke={seriesColor(0)} strokeWidth={2} />
    </svg>
  );
}

async function realGdpPerCapitaGrowth() {
  try {
    const loaded = await loadSeriesBySlugs(["GDPC1"], { viewer: null });
    const base = loaded.get("GDPC1");
    if (!base) return null;

    const result = await applyTransform(
      base.data,
      { ...emptyTransform(), perCapita: true, populationSlug: "B230RC0Q173SBEA", growth: "YOY" },
      makeSeriesLoader(null),
    );

    const values = result.points
      .filter((p) => p.value !== null)
      .map((p) => ({ date: p.date, value: p.value as number }));
    if (values.length < 2) return null;

    return {
      values: values.map((v) => v.value),
      firstDate: values[0]?.date ?? "",
      lastDate: values[values.length - 1]?.date ?? "",
      latest: values[values.length - 1]?.value ?? 0,
    };
  } catch {
    // A landing page must render even when the catalog has no data yet.
    return null;
  }
}
