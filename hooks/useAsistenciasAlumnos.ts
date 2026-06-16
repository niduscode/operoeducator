"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AsistenciaAlumno, Sucursal } from "@/lib/database.types";
import {
  registrarAsistenciaAlumno,
  updateAsistenciaAlumno,
  deleteAsistenciaAlumno,
  getAsistenciasDelDia,
} from "@/lib/queries";

type AsistenciaAlumnoInput = Omit<AsistenciaAlumno, "id">;

interface UseAsistenciasAlumnosReturn {
  asistencias: AsistenciaAlumno[];
  isLoading: boolean;
  error: string | null;
  registrar: (data: AsistenciaAlumnoInput) => Promise<string>;
  actualizar: (id: string, data: Partial<AsistenciaAlumnoInput>) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

// Suscripción reactiva a asistencias de una sucursal en una fecha específica.
// La fecha viene en formato ISO (yyyy-mm-dd). Si sucursal o fecha son null,
// no dispara la query.
export function useAsistenciasAlumnos(
  sucursal: Sucursal | null | undefined,
  fecha: string
): UseAsistenciasAlumnosReturn {
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    if (!sucursal || !fecha) {
      setAsistencias([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const rows = await getAsistenciasDelDia(sucursal, fecha);
        if (cancelled) return;
        setAsistencias(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("useAsistenciasAlumnos fetch:", err);
        setError("No se pudieron cargar las asistencias del día.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const channel = supabase
      .channel(`asistencias-alumnos-dia-${sucursal}-${fecha}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asistencias_alumnos",
          filter: `sucursal=eq.${sucursal}`,
        },
        () => {
          setNonce((n) => n + 1);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sucursal, fecha, nonce]);

  const registrar = useCallback(
    async (data: AsistenciaAlumnoInput) => {
      const id = await registrarAsistenciaAlumno(data);
      setNonce((n) => n + 1);
      return id;
    },
    []
  );

  const actualizar = useCallback(
    async (id: string, data: Partial<AsistenciaAlumnoInput>) => {
      await updateAsistenciaAlumno(id, data);
      setNonce((n) => n + 1);
    },
    []
  );

  const eliminar = useCallback(async (id: string) => {
    await deleteAsistenciaAlumno(id);
    setNonce((n) => n + 1);
  }, []);

  return useMemo(
    () => ({ asistencias, isLoading, error, registrar, actualizar, eliminar }),
    [asistencias, isLoading, error, registrar, actualizar, eliminar]
  );
}
