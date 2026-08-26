import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Section 20.4. Four variants and nothing else. Focus is always visible and is
 * never replaced by a colour change alone, which is handled globally in
 * globals.css rather than per component.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const BASE =
  "inline-flex h-[36px] items-center justify-center gap-2 rounded-control px-3 " +
  "text-small font-medium transition-colors duration-120 ease-system " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-rule-strong bg-transparent text-ink hover:bg-surface-sunken",
  ghost: "bg-transparent text-ink hover:bg-surface-sunken",
  destructive: "border border-danger/40 bg-transparent text-danger hover:bg-danger/10",
};

export function Button({ variant = "secondary", className, children, ...props }: ButtonProps) {
  return (
    <button type="button" className={twMerge(clsx(BASE, VARIANTS[variant], className))} {...props}>
      {children}
    </button>
  );
}

export default Button;
