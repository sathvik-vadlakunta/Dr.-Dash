"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Section 16.6. The join code is read off a slide and typed by hand, so it is
 * set in the mono face at a size that survives a projector, and the copy button
 * says what happened.
 */
export function JoinCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-card border border-rule p-3">
      <div className="flex flex-col">
        <span className="eyebrow">Join code</span>
        <span data-testid="join-code" className="font-mono text-data-lg tracking-[0.12em] text-ink">
          {code}
        </span>
      </div>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export default JoinCodeCard;
