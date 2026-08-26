"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Section 18. Toasts carry product copy, so the strings passed in are the exact
 * ones from the spec's tables. The region is `aria-live="polite"` so a screen
 * reader hears the message without losing the user's place.
 */

export interface ToastMessage {
  id: number;
  text: string;
  tone: "info" | "warn" | "error";
}

interface ToastApi {
  show(text: string, tone?: ToastMessage["tone"]): void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setMessages((current) => [...current, { id, text, tone }]);
    const timer = setTimeout(() => {
      setMessages((current) => current.filter((m) => m.id !== id));
    }, 6000);
    if (typeof timer === "object" && "unref" in timer) timer.unref?.();
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            data-testid="toast"
            className={[
              "pointer-events-auto max-w-[520px] rounded-card border px-4 py-3 text-small shadow-popover",
              m.tone === "error"
                ? "border-danger bg-surface-raised text-danger"
                : m.tone === "warn"
                  ? "border-warn bg-surface-raised text-warn"
                  : "border-rule bg-surface-raised text-ink",
            ].join(" ")}
          >
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
