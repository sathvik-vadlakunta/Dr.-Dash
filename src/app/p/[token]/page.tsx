import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DashboardWorkspace } from "@/components/chart/DashboardWorkspace";
import { ToastProvider } from "@/components/ui/Toast";
import { fetchPublishedDashboard } from "@/lib/db";
import { parseState } from "@/lib/dashboard/urlState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 17.1. The secondary-market-2 surface: an agency publishes data and
 * anyone can examine, transform, and download it without an account and without
 * contacting the entity. Everything below the header is the same workspace the
 * signed-in dashboard uses, minus the catalog and the save action.
 */

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const dashboard = await fetchPublishedDashboard(token);
  if (!dashboard) return { title: "Not found" };

  const description =
    dashboard.description ??
    `Published by ${dashboard.owner.orgName ?? dashboard.owner.name} on Dr. Dash.`;

  return {
    title: dashboard.title,
    description,
    openGraph: { title: dashboard.title, description, type: "article" },
  };
}

export default async function PublishedDashboardPage({ params }: PageProps) {
  const { token } = await params;
  const dashboard = await fetchPublishedDashboard(token);
  if (!dashboard) notFound();

  const state = parseState(dashboard.state);

  return (
    <ToastProvider>
      <main className="flex flex-col">
        <header className="flex flex-col gap-1 border-b border-rule px-4 py-4">
          <h1 className="font-display text-display-m">{dashboard.title}</h1>
          {dashboard.description ? (
            <p className="max-w-[72ch] text-body text-ink">{dashboard.description}</p>
          ) : null}
          <p className="text-small text-ink-muted">
            Published by {dashboard.owner.orgName ?? dashboard.owner.name}
          </p>
        </header>

        <Suspense fallback={<div className="skeleton h-[520px] w-full" aria-hidden />}>
          <DashboardWorkspace
            categories={[]}
            initialState={state}
            chrome="public"
            exportTitle={dashboard.title}
          />
        </Suspense>
      </main>
    </ToastProvider>
  );
}
