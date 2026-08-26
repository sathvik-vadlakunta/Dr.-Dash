"use client";

import { useId } from "react";
import type { ReactNode } from "react";

/**
 * Section 15.2. A disabled control keeps its label visible and shows its reason
 * on hover *and* on focus, so the explanation is reachable from the keyboard
 * rather than only from a mouse.
 */
export interface TooltipProps {
  content: string | null | undefined;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  if (!content) return <>{children}</>;

  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-[240px] rounded-control border border-rule bg-surface-raised p-2 text-small text-ink shadow-popover group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
