import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DashboardWorkspace } from "@/components/chart/DashboardWorkspace";
import { ToastProvider } from "@/components/ui/Toast";
import { parseState } from "@/lib/dashboard/urlState";
import { fetchPublishedDashboard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 17.2. The same data as `/p/[token]` with the chrome removed: no top
 * bar, no save, no copy link. `next.config.ts` sets `frame-ancestors *` on this
 * path and only this path, so it is the one page in the product another origin
 * may frame.
 *
 * The app's top bar lives in the root layout, which a nested route cannot
 * unmount, so `.embed-root` below is what the rule in `globals.css` keys off to
 * drop it. Marking the page is enough: no client JavaScript, no flash.
 */

const DEFAULT_HEIGHT = 520;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 2000;

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?height=` in pixels, clamped; anything unreadable falls back to 520. */
function readHeight(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));
}

/** `?theme=light|dark` overrides the framing page's preference. */
function readTheme(raw: string | string[] | undefined): "light" | "dark" | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "light" || value === "dark" ? value : null;
}

export const metadata = { robots: { index: false, follow: false } };

export default async function EmbeddedDashboardPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const dashboard = await fetchPublishedDashboard(token);
  // Section 17.2: an unpublished token and a published-but-not-embeddable one
  // are the same answer, so refusing to embed never confirms the dashboard.
  if (!dashboard || !dashboard.allowEmbed) notFound();

  const height = readHeight(query.height);
  const theme = readTheme(query.theme);

  return (
    <ToastProvider>
      <div className="embed-root" {...(theme ? { "data-theme": theme } : {})}>
        <main className="flex flex-col">
          <h1 className="sr-only">{dashboard.title}</h1>
          <Suspense fallback={<div className="skeleton h-[520px] w-full" aria-hidden />}>
            <DashboardWorkspace
              categories={[]}
              initialState={parseState(dashboard.state)}
              chrome="embed"
              exportTitle={dashboard.title}
              height={height}
            />
          </Suspense>
        </main>
      </div>
    </ToastProvider>
  );
}
