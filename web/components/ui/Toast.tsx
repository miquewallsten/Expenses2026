"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ToastVariant = "info" | "success" | "warn" | "error";

interface Toast {
  id: number;
  variant: ToastVariant;
  message: ReactNode;
  description?: ReactNode;
}

interface ToastApi {
  show: (t: Omit<Toast, "id">) => number;
  success: (msg: ReactNode, description?: ReactNode) => number;
  error: (msg: ReactNode, description?: ReactNode) => number;
  warn: (msg: ReactNode, description?: ReactNode) => number;
  info: (msg: ReactNode, description?: ReactNode) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_COLOR: Record<ToastVariant, string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  error: "border-red-500/30 bg-red-500/10 text-red-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((cur) => [...cur, { ...t, id }]);
      setTimeout(() => dismiss(id), 4500);
      return id;
    },
    [dismiss],
  );

  const api: ToastApi = {
    show,
    dismiss,
    success: (msg, description) => show({ variant: "success", message: msg, description }),
    error: (msg, description) => show({ variant: "error", message: msg, description }),
    warn: (msg, description) => show({ variant: "warn", message: msg, description }),
    info: (msg, description) => show({ variant: "info", message: msg, description }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "rounded-md border px-3 py-2 text-[11px] shadow-xl backdrop-blur-sm",
              "pointer-events-auto",
              VARIANT_COLOR[t.variant],
            )}
            onClick={() => dismiss(t.id)}
          >
            <div className="font-medium">{t.message}</div>
            {t.description && (
              <div className="mt-0.5 opacity-75">{t.description}</div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
