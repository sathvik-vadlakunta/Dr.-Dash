"use client";

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  /** Shown in a tooltip when the control is disabled (Section 15.2). */
  disabledReason?: string;
}

export function Select({
  label,
  options,
  disabledReason,
  className,
  id,
  disabled,
  ...props
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-small font-medium text-ink">
        {label}
      </label>
      <select
        id={selectId}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        title={disabled ? disabledReason : undefined}
        className={twMerge(
          clsx(
            "h-[36px] rounded-control border border-rule-strong bg-surface px-2 font-mono text-data text-ink",
            disabled && "cursor-not-allowed opacity-50",
            className,
          ),
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Select;
