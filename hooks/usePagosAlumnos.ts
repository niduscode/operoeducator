"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PagoAlumno, Sucursal } from "@/lib/database.types";
import {
  getPagosDelMes,
  registrarPagoAlumno,
  updatePagoAlumno,
  deletePagoAlumno,
} from "@/lib/queries";

export type PagoAlumnoInput = Omit<PagoAlumno, "id" | "registradoEn">;

interface UsePagosAlumnosReturn {
  pagos: PagoAlumno[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  registrar: (input: PagoAlumnoInput) => Promise<string>;
  actualizar: (id: string, patch: Partial<PagoAlumnoInput>) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
  // Aliases compat con código viejo (registrarPago/actualizarPago/eliminarPago).
  registrarPago: (input: PagoAlumnoInput) => Promise<string>;
  actualizarPago: (id: string, patch: Partial<PagoAlumnoInput>) => Promise<void>;
  eliminarPago: (id: string) => Promise<void>;
}

// Pagos del mes filtrados por mes/año (siempre) y opcionalmente por sucursal.
// No usa Realtime: refetch manual al montar y tras cada acción
// (registrar/actualizar/eliminar). Para forzar refresco externo se expone
// `refetch`, que internamente bumpea un nonce que dispara el efecto.
export function usePagosAlumnos(
  mes: number,
  año: number,
  sucursal?: Sucursal | null
): UsePagosAlumnosReturn {
  const [pagos, setPagos] = useState<PagoAlumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const refetch = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await getPagosDelMes(año, mes, sucursal ?? undefined);
        if (cancelled) return;
        setPagos(rows);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("usePagosAlumnos fetch:", err);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los pagos del mes."
        );
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mes, año, sucursal, nonce]);

  const registrar = useCallback(
    async (input: PagoAlumnoInput) => {
      const id = await registrarPagoAlumno(input);
      setNonce((n) => n + 1);
      return id;
    },
    []
  );

  const actualizar = useCallback(
    async (id: string, patch: Partial<PagoAlumnoInput>) => {
      await updatePagoAlumno(id, patch);
      setNonce((n) => n + 1);
    },
    []
  );

  const eliminar = useCallback(async (id: string) => {
    await deletePagoAlumno(id);
    setNonce((n) => n + 1);
  }, []);

  return useMemo(
    () => ({
      pagos,
      isLoading,
      error,
      refetch,
      registrar,
      actualizar,
      eliminar,
      // Aliases compat
      registrarPago: registrar,
      actualizarPago: actualizar,
      eliminarPago: eliminar,
    }),
    [pagos, isLoading, error, refetch, registrar, actualizar, eliminar]
  );
}
