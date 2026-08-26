import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

/** Section 16.7. Four cards, and the banner Section 4.3 requires when no key is set. */
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [seriesCount, observationCount, latestSync, pendingRequests] = await Promise.all([
    prisma.series.count(),
    prisma.observation.count(),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.seriesRequest.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-display-m">Admin</h1>

      {config.hasFredKey ? null : (
        <p className="rounded-card border border-warn p-4 text-body text-warn">
          Set FRED_API_KEY to sync live data.{" "}
          <a
            href="https://fredaccount.stlouisfed.org/apikeys"
            className="underline"
            rel="noreferrer noopener"
            target="_blank"
          >
            Get a free key
          </a>
          .
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card label="Series" value={seriesCount.toLocaleString("en-US")} />
        <Card label="Observations" value={observationCount.toLocaleString("en-US")} />
        <Card
          label="Last sync"
          value={
            latestSync
              ? `${latestSync.status} · ${latestSync.startedAt.toISOString().slice(0, 16).replace("T", " ")}`
              : "never"
          }
        />
        <Card label="Pending requests" value={String(pendingRequests)} />
      </div>

      <nav className="flex gap-4 text-small">
        <Link href="/admin/sync" className="text-accent underline">
          Sync
        </Link>
        <Link href="/admin/requests" className="text-accent underline">
          Approval queue
        </Link>
      </nav>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-rule p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-mono text-data-lg text-ink">{value}</p>
    </div>
  );
}
