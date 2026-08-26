import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveCategoryTree } from "@/lib/db";
import { DashboardWorkspace } from "@/components/chart/DashboardWorkspace";
import { ToastProvider } from "@/components/ui/Toast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

/**
 * Section 16.3. Three panes above 1200 px. The category tree is resolved here,
 * on the server (Section 21.2), and everything interactive lives in the client
 * workspace below it.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/dashboard");

  const categories = await resolveCategoryTree(session.user);

  return (
    <ToastProvider>
      <Suspense fallback={<div className="skeleton h-[520px] w-full" aria-hidden />}>
        <DashboardWorkspace categories={categories} />
      </Suspense>
    </ToastProvider>
  );
}
