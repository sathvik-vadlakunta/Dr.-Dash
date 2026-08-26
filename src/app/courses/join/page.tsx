"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { ApiErrorBody } from "@/types";

/** Section 16.6. One input, because that is all a student has been given. */
export default function JoinCoursePage() {
  // Section 21.1.8. A client page cannot export `metadata`, so the title
  // is set here; the root layout supplies the "- Dr. Dash" suffix elsewhere.
  useEffect(() => {
    document.title = "Join a course - Dr. Dash";
  }, []);

  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/courses/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: code.trim().toUpperCase() }),
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
    <main className="mx-auto flex w-[min(420px,92vw)] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-display-m">Join a course</h1>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <Field
          label="Join code"
          value={code}
          required
          maxLength={6}
          autoCapitalize="characters"
          className="font-mono text-data-lg tracking-[0.12em] uppercase"
          hint="Six characters, from your instructor."
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error}
        />

        <Button variant="primary" type="submit" disabled={busy || code.trim().length < 4} className="self-start">
          Join
        </Button>
      </form>
    </main>
  );
}
