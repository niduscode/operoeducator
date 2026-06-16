"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PagoRealizado, Sucursal } from "@/lib/database.types";
import {
  getPagosRealizadosDelMes,
  marcarPagoRealizado,
  deletePagoRealizado,
} from "@/lib/queries";

export type PagoRealizadoInput = Omit<PagoRealizado, "id" | "pagadoEn">;

interface UsePagosRealizadosReturn {
  pagos: PagoRealizado[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  marcar: (data: PagoRealizadoInput) => Promise<string>;
  desmarcar: (id: string) => Promise<void>;
  buscar: (
    tipo: "instructor" | "profeGuia",
    personaId: string
  ) => PagoRealizado | undefined;
  marcarPagado: (data: PagoRealizadoInput) => Promise<string>;
  eliminar: (id: string) => Promise<void>;
}

export function usePagosRealizados(
  mes: number,
  año: number,
  sucursal?: Sucursal
): UsePagosRealizadosReturn {
  const [pagos, setPagos] = useState<PagoRealizado[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getPagosRealizadosDelMes(año, mes, sucursal)
      .then((rows) => {
        if (cancelled) return;
        setPagos(rows);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("usePagosRealizados fetch:", err);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los pagos realizados."
        );
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mes, año, sucursal, nonce]);

  const marcar = useCallback(
    async (data: PagoRealizadoInput) => {
      const id = await marcarPagoRealizado(data);
      refetch();
      return id;
    },
    [refetch]
  );

  const desmarcar = useCallback(
    async (id: string) => {
      await deletePagoRealizado(id);
      refetch();
    },
    [refetch]
  );

  const buscar = useCallback(
    (tipo: "instructor" | "profeGuia", personaId: string) =>
      pagos.find((p) => p.tipo === tipo && p.personaId === personaId),
    [pagos]
  );

  return useMemo(
    () => ({
      pagos,
      isLoading,
      error,
      refetch,
      marcar,
      desmarcar,
      buscar,
      marcarPagado: marcar,
      eliminar: desmarcar,
    }),
    [pagos, isLoading, error, refetch, marcar, desmarcar, buscar]
  );
}
