"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import Modal from "./Modal";
import Button from "./Button";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface ActiveConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveConfirm | null>(null);
  // Evitamos doble click: si onConfirm dispara una promesa async, deshabilitamos.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setActive({ ...options, resolve });
      }),
    []
  );

  const finish = useCallback(
    (value: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const a = active;
      setActive(null);
      // Limpiar busy en el siguiente tick para que el modal cierre limpio.
      setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, 50);
      if (a) a.resolve(value);
    },
    [active]
  );

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {active && (
        <Modal
          title={active.title ?? "¿Confirmar acción?"}
          onClose={() => finish(false)}
        >
          <div className="space-y-4">
            <div className="text-sm text-slate-600 leading-relaxed">
              {active.message}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => finish(false)}
                disabled={busy}
              >
                {active.cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                variant={active.variant ?? "danger"}
                onClick={() => finish(true)}
                disabled={busy}
              >
                {active.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  }
  return ctx.confirm;
}
