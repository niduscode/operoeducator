"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  show: (
    message: string,
    options?: { type?: ToastType; duration?: number }
  ) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
};

const STYLES: Record<ToastType, string> = {
  success: "bg-emerald-600 text-white shadow-emerald-600/30",
  error: "bg-rose-600 text-white shadow-rose-600/30",
  info: "bg-slate-900 text-white shadow-slate-900/30",
  warning: "bg-amber-500 text-white shadow-amber-500/30",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (
      message: string,
      options?: { type?: ToastType; duration?: number }
    ) => {
      const type = options?.type ?? "info";
      const duration =
        options?.duration ??
        (type === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      idRef.current += 1;
      const id = idRef.current;
      setItems((prev) => [...prev, { id, type, message, duration }]);
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show(m, { type: "success", duration: d }),
      error: (m, d) => show(m, { type: "error", duration: d }),
      info: (m, d) => show(m, { type: "info", duration: d }),
      warning: (m, d) => show(m, { type: "warning", duration: d }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-6 right-6 z-[300] flex flex-col gap-2 max-w-[calc(100vw-3rem)] sm:max-w-sm pointer-events-none"
      >
        {items.map((t) => (
          <ToastView key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  // Cierre automático con setTimeout. Usamos useEffect en mount para no
  // re-armarlo en cada render. duration === 0 = persistente.
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(onClose, toast.duration);
    return () => clearTimeout(t);
  }, [toast.duration, onClose]);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-start gap-3 animate-[fadeIn_0.2s_ease] ${STYLES[toast.type]}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-xs font-bold flex-shrink-0 mt-0.5"
      >
        {ICONS[toast.type]}
      </span>
      <span className="flex-1 leading-snug whitespace-pre-line break-words">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="ml-2 -mr-1 -mt-0.5 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/15 active:scale-90 transition-all flex-shrink-0"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return ctx;
}
