"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { decodeState, encodeState } from "@/lib/dashboard/urlState";
import { checkState, targetToState } from "@/lib/lessons/stateCheck";
import type { DashboardTarget } from "@/lib/lessons/schema";

/**
 * Section 19.3. The check runs on the URL, with no network call, so the
 * checklist turns green the instant the student touches the right control.
 * That is what makes the task feel like part of the product rather than a quiz
 * about it.
 */

export interface StateCheckBadgeProps {
  target: DashboardTarget;
  allowAutoSet: boolean;
  labelOf?: (slug: string) => string;
  onSatisfiedChange: (satisfied: boolean) => void;
}

/** The URL is written with the History API, so it is polled rather than subscribed to. */
function useSearch(): string {
  const [search, setSearch] = useState("");

  useEffect(() => {
    const read = () => setSearch(window.location.search);
    read();
    const timer = setInterval(read, 200);
    window.addEventListener("popstate", read);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", read);
    };
  }, []);

  return search;
}

export function StateCheckBadge({
  target,
  allowAutoSet,
  labelOf,
  onSatisfiedChange,
}: StateCheckBadgeProps) {
  const search = useSearch();
  const current = decodeState(new URLSearchParams(search));
  const result = checkState(current, target, labelOf);

  useEffect(() => {
    onSatisfiedChange(result.satisfied);
  }, [result.satisfied, onSatisfiedChange]);

  function setItForMe() {
    const next = targetToState(target, current);
    const query = encodeState(next).toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
    // The dashboard listens for popstate to hand authority back to the URL.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div
      data-testid="state-check"
      data-satisfied={result.satisfied ? "true" : "false"}
      className={`flex flex-col gap-2 rounded-control border p-3 ${
        result.satisfied ? "border-ok" : "border-rule"
      }`}
    >
      <p className={`text-small font-medium ${result.satisfied ? "text-ok" : "text-ink"}`}>
        {result.satisfied ? "Done. The chart is showing what the task asked for." : "To do"}
      </p>

      {result.satisfied ? null : (
        <ul className="flex flex-col gap-1">
          {result.missing.map((item) => (
            <li key={item} className="flex items-start gap-2 text-small text-ink-muted">
              <span aria-hidden className="font-mono text-data">
                ☐
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}

      {allowAutoSet && !result.satisfied ? (
        <Button variant="secondary" className="self-start" onClick={setItForMe}>
          Set it for me
        </Button>
      ) : null}
    </div>
  );
}

export default StateCheckBadge;
