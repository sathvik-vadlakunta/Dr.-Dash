"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { ApiErrorBody } from "@/types";

export default function NewCoursePage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "New course - Dr. Dash";
  }, []);

  const router = useRouter();
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), term: term.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error.message);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      router.push(`/courses/${body.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-[min(480px,92vw)] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-display-m">New course</h1>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field
          label="Course name"
          value={name}
          required
          placeholder="Principles of Macroeconomics"
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Term"
          value={term}
          required
          placeholder="Fall 2026"
          onChange={(e) => setTerm(e.target.value)}
        />

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <Button
          variant="primary"
          type="submit"
          disabled={busy || name.trim() === "" || term.trim() === ""}
          className="self-start"
        >
          Create course
        </Button>
      </form>
    </main>
  );
}
