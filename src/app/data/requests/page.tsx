"use client";

import { useCallback, useEffect, useState } from "react";
import { SeriesRequestForm } from "@/components/catalog/SeriesRequestForm";
import { Table } from "@/components/ui/Table";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Section 9.5 step 5. The requester sees the status of what they asked for,
 * including the reason when a request was turned down.
 */

interface RequestRow {
  id: string;
  fredId: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
}

export default function RequestsPage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Request a series - Dr. Dash";
  }, []);

  return (
    <ToastProvider>
      <Requests />
    </ToastProvider>
  );
}

function Requests() {
  const [rows, setRows] = useState<RequestRow[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/series-requests");
    if (!res.ok) return;
    const body = (await res.json()) as { data: RequestRow[] };
    setRows(body.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-[72ch] flex-col gap-8 px-4 py-8">
      <div>
        <h1 className="font-display text-display-m">Request a series</h1>
        <p className="mt-2 text-body text-ink-muted">
          Anything FRED publishes can be added to the Dr. Dash catalog. Find it here and an
          administrator will map its metadata and pull its history.
        </p>
      </div>

      <SeriesRequestForm onSubmitted={() => void load()} />

      <section className="flex flex-col gap-3">
        <h2 className="text-title">Your requests</h2>
        {rows.length === 0 ? (
          <p className="text-small text-ink-muted">You have not requested anything yet.</p>
        ) : (
          <Table
            head={["Series", "Requested", "Status", "Note"]}
            rows={rows.map((r) => [
              <span key={r.id} className="font-mono text-data">
                {r.fredId}
              </span>,
              r.createdAt.slice(0, 10),
              r.status === "REJECTED" && r.rejectionReason
                ? `Rejected: ${r.rejectionReason}`
                : r.status.toLowerCase(),
              r.note ?? "",
            ])}
          />
        )}
      </section>
    </main>
  );
}
