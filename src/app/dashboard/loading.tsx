/**
 * Section 18. A skeleton with the final layout's dimensions, so the page does
 * not jump when the data lands. Never a spinner over the whole page.
 */
export default function DashboardLoading() {
  return (
    <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[280px_1fr_320px]">
      <div className="border-r border-rule p-3">
        <div className="skeleton h-[36px] w-full rounded-control" />
      </div>
      <div className="p-4">
        <div className="skeleton h-[520px] w-full max-md:h-[360px]" />
      </div>
      <div className="border-l border-rule p-4">
        <div className="skeleton h-[240px] w-full rounded-control" />
      </div>
      <span className="sr-only">Loading the dashboard.</span>
    </div>
  );
}
