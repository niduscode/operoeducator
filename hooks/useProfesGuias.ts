"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ProfeGuia, Sucursal } from "@/lib/database.types";
import {
  getProfesGuias,
  getProfesGuiasPorSucursal,
  createProfeGuia as sbCreateProfeGuia,
  updateProfeGuia as sbUpdateProfeGuia,
  deleteProfeGuia as sbDeleteProfeGuia,
  reactivateProfeGuia as sbReactivateProfeGuia,
  createProfesGuiasMasivo as sbImportMasivo,
} from "@/lib/queries";

export type ProfeGuiaInput = Omit<ProfeGuia, "id">;

interface UseProfesGuiasReturn {
  profesGuias: ProfeGuia[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createProfeGuia: (data: ProfeGuiaInput) => Promise<string>;
  updateProfeGuia: (id: string, data: Partial<ProfeGuiaInput>) => Promise<void>;
  deleteProfeGuia: (id: string) => Promise<void>;
  reactivateProfeGuia: (id: string) => Promise<void>;
  importMasivo: (data: ProfeGuiaInput[]) => Promise<string[]>;
}

interface UseProfesGuiasOptions {
  // Por defecto sólo devuelve activos. Pasa true para mostrar desactivados.
  incluirInactivos?: boolean;
}

export function useProfesGuias(
  sucursal?: Sucursal | null,
  options?: UseProfesGuiasOptions
): UseProfesGuiasReturn {
  const incluirInactivos = options?.incluirInactivos ?? false;
  const [profesGuias, setProfesGuias] = useState<ProfeGuia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const rows = sucursal
          ? await getProfesGuiasPorSucursal(sucursal)
          : await getProfesGuias();
        if (cancelled) return;
        const filtered = rows.filter(
          (p) => incluirInactivos || p.activo !== false
        );
        setProfesGuias(filtered);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("useProfesGuias fetch:", err);
        setError("No se pudieron cargar los profes guías.");
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sucursal, nonce, incluirInactivos]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const createProfeGuia = useCallback(
    async (data: ProfeGuiaInput) => {
      const id = await sbCreateProfeGuia(data);
      setNonce((n) => n + 1);
      return id;
    },
    []
  );
  const updateProfeGuia = useCallback(
    async (id: string, data: Partial<ProfeGuiaInput>) => {
      await sbUpdateProfeGuia(id, data);
      setNonce((n) => n + 1);
    },
    []
  );
  const deleteProfeGuia = useCallback(async (id: string) => {
    await sbDeleteProfeGuia(id);
    setNonce((n) => n + 1);
  }, []);
  const reactivateProfeGuia = useCallback(async (id: string) => {
    await sbReactivateProfeGuia(id);
    setNonce((n) => n + 1);
  }, []);
  const importMasivo = useCallback(async (data: ProfeGuiaInput[]) => {
    const ids = await sbImportMasivo(data);
    setNonce((n) => n + 1);
    return ids;
  }, []);

  return useMemo(
    () => ({
      profesGuias,
      isLoading,
      error,
      refetch,
      createProfeGuia,
      updateProfeGuia,
      deleteProfeGuia,
      reactivateProfeGuia,
      importMasivo,
    }),
    [
      profesGuias,
      isLoading,
      error,
      refetch,
      createProfeGuia,
      updateProfeGuia,
      deleteProfeGuia,
      reactivateProfeGuia,
      importMasivo,
    ]
  );
}
