"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * A monospace chip. Section 20.2's rule holds here: a chip carries a slug, a
 * value, or a formula step, and none of those are ever set in the body face.
 */
export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  selected?: boolean;
  tone?: "default" | "accent" | "warn";
}

export function Chip({ children, selected, tone = "default", className, ...props }: ChipProps) {
  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-2 rounded-control border px-2 py-1 font-mono text-data",
          tone === "default" && "border-rule bg-surface text-ink",
          tone === "accent" && "border-accent bg-surface text-accent",
          tone === "warn" && "border-warn bg-surface text-warn",
          selected && "outline outline-2 outline-offset-1 outline-accent",
          className,
        ),
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Chip;
