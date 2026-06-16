"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getAsistenciasProfesDelDia,
  registrarAsistenciaProfe,
  updateAsistenciaProfe,
  deleteAsistenciaProfe,
} from "@/lib/queries";
import type { AsistenciaProfeGuia, Sucursal } from "@/lib/database.types";

type AsistenciaProfeGuiaInput = Omit<AsistenciaProfeGuia, "id">;

interface UseAsistenciasProfesReturn {
  asistencias: AsistenciaProfeGuia[];
  isLoading: boolean;
  error: string | null;
  registrar: (data: AsistenciaProfeGuiaInput) => Promise<string>;
  actualizar: (
    id: string,
    data: Partial<AsistenciaProfeGuiaInput>
  ) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

export function useAsistenciasProfes(
  sucursal: Sucursal | null | undefined,
  fecha: string
): UseAsistenciasProfesReturn {
  const [asistencias, setAsistencias] = useState<AsistenciaProfeGuia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!sucursal || !fecha) {
      setAsistencias([]);
      setIsLoading(false);
      return;
    }
    try {
      const rows = await getAsistenciasProfesDelDia(sucursal, fecha);
      setAsistencias(rows);
      setError(null);
    } catch (err) {
      console.error("useAsistenciasProfes refetch:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las asistencias de profes guías."
      );
    } finally {
      setIsLoading(false);
    }
  }, [sucursal, fecha]);

  useEffect(() => {
    if (!sucursal || !fecha) {
      setAsistencias([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void refetch();

    const channel = supabase
      .channel(`asistencias-profes-${sucursal}-${fecha}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asistencias_profes_guias",
          filter: `sucursal=eq.${sucursal}`,
        },
        () => {
          void refetch();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sucursal, fecha, refetch]);

  const registrar = useCallback(
    async (data: AsistenciaProfeGuiaInput) => {
      const id = await registrarAsistenciaProfe(data);
      await refetch();
      return id;
    },
    [refetch]
  );

  const actualizar = useCallback(
    async (id: string, data: Partial<AsistenciaProfeGuiaInput>) => {
      await updateAsistenciaProfe(id, data);
      await refetch();
    },
    [refetch]
  );

  const eliminar = useCallback(
    async (id: string) => {
      await deleteAsistenciaProfe(id);
      await refetch();
    },
    [refetch]
  );

  return useMemo(
    () => ({ asistencias, isLoading, error, registrar, actualizar, eliminar }),
    [asistencias, isLoading, error, registrar, actualizar, eliminar]
  );
}
