"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Section 21.1.5. A dialog traps focus and restores it on close, and Escape
 * closes it (Section 16.1). It is a real `<dialog>`, so the browser handles the
 * top layer and the backdrop.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Section 16.3. The catalog collapses to a left drawer between 768 and
   * 1200 px, and the catalog and transforms become bottom sheets below 768 px.
   * All three are the same thing to a keyboard and a screen reader — a modal
   * that traps focus and gives it back — so they are one component and differ
   * only in where they sit.
   */
  variant?: "modal" | "drawer" | "sheet";
}

const FRAME: Record<NonNullable<DialogProps["variant"]>, string> = {
  modal: "w-[min(560px,92vw)] rounded-card border border-rule",
  drawer: "fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-[min(320px,88vw)] rounded-none border-r border-rule",
  sheet: "fixed inset-x-0 bottom-0 m-0 mt-auto max-h-[85dvh] w-full max-w-full rounded-t-card border-t border-rule",
};

export function Dialog({ open, onClose, title, children, footer, variant = "modal" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (open && !node.open) {
      restoreTo.current = document.activeElement as HTMLElement | null;
      node.showModal();
    } else if (!open && node.open) {
      node.close();
      restoreTo.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={close}
      className={`${FRAME[variant]} overflow-y-auto bg-surface-raised p-0 text-ink shadow-popover backdrop:bg-ink/40`}
    >
      <div className="panel-header flex items-center justify-between">
        <h2 className="text-subtitle font-semibold">{title}</h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded-control px-2 py-1 text-ink-muted hover:bg-surface-sunken"
        >
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-rule p-4">{footer}</div>
      ) : null}
    </dialog>
  );
}

export default Dialog;
