"use client";

import { forwardRef, useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Section 21.1.6. Every field has a real `<label>`, and its error is tied to it
 * with `aria-describedby` so a screen reader reads the problem with the field
 * rather than somewhere else on the page.
 */
export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-small font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={clsx(error && errorId, hint && hintId) || undefined}
        className={twMerge(
          clsx(
            "h-[36px] rounded-control border bg-surface px-3 text-body text-ink",
            error ? "border-danger" : "border-rule-strong",
            className,
          ),
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export default Field;

/**
 * Section 10.3 and 21.1.6. Sign-in and sign-up share one form: the fields, the
 * error handling, and the focus-the-first-invalid-field behaviour are the same,
 * and the copy is the only difference.
 */
export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next: string }) {
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"STUDENT" | "INSTRUCTOR">("STUDENT");
  const [instructorCode, setInstructorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstInvalid = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isSignUp
            ? {
                name,
                email,
                password,
                role,
                ...(role === "INSTRUCTOR" && instructorCode.trim()
                  ? { instructorCode: instructorCode.trim() }
                  : {}),
              }
            : { email, password },
        ),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error: { message: string } };
        setError(body.error.message);
        firstInvalid.current?.focus();
        return;
      }
      window.location.assign(next);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-[min(420px,92vw)] flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-display-m">
        {isSignUp ? "Create an account" : "Sign in"}
      </h1>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {isSignUp ? (
          <Field
            label="Name"
            value={name}
            autoComplete="name"
            required
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}

        <Field
          ref={firstInvalid}
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          hint={isSignUp ? "At least 10 characters." : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />

        {isSignUp ? (
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="text-small font-medium text-ink">I am a</legend>
            {(["STUDENT", "INSTRUCTOR"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-small text-ink">
                <input
                  type="radio"
                  name="role"
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                {value === "STUDENT" ? "Student" : "Instructor"}
              </label>
            ))}
          </fieldset>
        ) : null}

        {isSignUp && role === "INSTRUCTOR" ? (
          <Field
            label="Instructor code"
            value={instructorCode}
            hint="From your organization. Required outside development."
            onChange={(e) => setInstructorCode(e.target.value)}
          />
        ) : null}

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="h-[36px] rounded-control bg-accent px-4 text-small font-medium text-accent-ink disabled:opacity-50"
        >
          {isSignUp ? "Create an account" : "Sign in"}
        </button>
      </form>

      <p className="text-small text-ink-muted">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <a href={isSignUp ? "/sign-in" : "/sign-up"} className="text-accent underline">
          {isSignUp ? "Sign in" : "Create one"}
        </a>
      </p>
    </main>
  );
}
