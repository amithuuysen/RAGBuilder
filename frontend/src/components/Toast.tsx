"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { Check, AlertTriangle, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm animate-fade-in ${
              toast.kind === "success"
                ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-100"
                : toast.kind === "error"
                  ? "bg-red-950/90 border-red-500/30 text-red-100"
                  : "bg-slate-900/90 border-slate-700 text-slate-100"
            }`}
          >
            {toast.kind === "success" ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : toast.kind === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : null}
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
